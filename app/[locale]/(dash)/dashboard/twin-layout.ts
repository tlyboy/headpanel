import type { TwinNode, TwinSite } from './twin'

const CELL_WIDTH = 3
const CELL_DEPTH = 2.8
const PADDING = 0.5
const ZONE_GAP = 0.8
/** Zones lean wide because the card is wide and depth is foreshortened anyway. */
const ZONE_ASPECT = 2.2
const ROW_GAP = 1.6
const HUB_ROW_DEPTH = 2.6
const MAX_ZOOM = 44
const FRAME_MARGIN_PX = 16
/** Tallest thing in the scene, so the frame leaves room above the back row. */
const SCENE_HEIGHT = 1.6
const ELEVATION = (42 * Math.PI) / 180

export const HUB_RADIUS = 1.1
export const PLATFORM_HEIGHT = 0.3
/** How far in front of a device's centre its label starts. */
export const LABEL_OFFSET_Z = 0.55
const DEVICE_OFFSET_Z = -0.15

/** Unit vectors of the fixed camera, which looks straight ahead and down. */
export const CAMERA_DIR = [0, Math.sin(ELEVATION), Math.cos(ELEVATION)] as const
const CAMERA_RIGHT = [1, 0, 0] as const
const CAMERA_UP = [0, Math.cos(ELEVATION), -Math.sin(ELEVATION)] as const

export interface ViewSize {
  width: number
  height: number
}

export interface PlacedNode {
  node: TwinNode
  x: number
  z: number
}

export interface PlacedSite {
  site: TwinSite
  x: number
  z: number
  width: number
  depth: number
  nodes: PlacedNode[]
}

export interface TwinLayout {
  sites: PlacedSite[]
  hubZ: number
  zoom: number
  /** Width in pixels of one device cell, which bounds its label. */
  cellPx: number
  center: [number, number, number]
  midU: number
  midV: number
  /** Half the ground extent, used to size the shadow camera. */
  radius: number
}

type Zone = Omit<PlacedSite, 'x' | 'z'>

function shapeZone(site: TwinSite): Zone {
  const count = Math.max(1, site.nodes.length)
  const cols = Math.min(count, Math.ceil(Math.sqrt(count * ZONE_ASPECT)))
  const rows = Math.ceil(count / cols)
  return {
    site,
    width: cols * CELL_WIDTH + PADDING * 2,
    depth: rows * CELL_DEPTH + PADDING,
    nodes: site.nodes.map((node, i) => ({
      node,
      x: ((i % cols) - (cols - 1) / 2) * CELL_WIDTH,
      z: (Math.floor(i / cols) - (rows - 1) / 2) * CELL_DEPTH + DEVICE_OFFSET_Z,
    })),
  }
}

const rowWidth = (row: Zone[]) =>
  row.reduce((sum, zone) => sum + zone.width, 0) + ZONE_GAP * Math.max(0, row.length - 1)

/** Gateways share the first row so their links fan out from the hub without crossing other zones. */
function packRows(gateways: Zone[], rest: Zone[], maxWidth: number): Zone[][] {
  const rows: Zone[][] = gateways.length ? [gateways] : []
  let current: Zone[] = []
  for (const zone of rest) {
    if (current.length && rowWidth([...current, zone]) > maxWidth) {
      rows.push(current)
      current = []
    }
    current.push(zone)
  }
  if (current.length) rows.push(current)
  return rows
}

const dot = (a: readonly number[], x: number, y: number, z: number) =>
  a[0] * x + a[1] * y + a[2] * z

function arrange(rows: Zone[][], view: ViewSize): TwinLayout {
  const totalDepth =
    HUB_ROW_DEPTH +
    rows.reduce((sum, row) => sum + Math.max(...row.map((z) => z.depth)) + ROW_GAP, 0)

  const sites: PlacedSite[] = []
  let cursor = -totalDepth / 2 + HUB_ROW_DEPTH + ROW_GAP / 2
  for (const row of rows) {
    const depth = Math.max(...row.map((z) => z.depth))
    let left = -rowWidth(row) / 2
    for (const zone of row) {
      sites.push({ ...zone, x: left + zone.width / 2, z: cursor + zone.depth / 2 })
      left += zone.width + ZONE_GAP
    }
    cursor += depth + ROW_GAP
  }

  const hubZ = -totalDepth / 2 + HUB_RADIUS
  const points: [number, number, number][] = [
    [-HUB_RADIUS, SCENE_HEIGHT, hubZ - HUB_RADIUS],
    [HUB_RADIUS, 0, hubZ + HUB_RADIUS],
  ]
  let radius = totalDepth / 2
  for (const s of sites) {
    const [hw, hd] = [s.width / 2, s.depth / 2]
    points.push([s.x - hw, 0, s.z + hd], [s.x + hw, SCENE_HEIGHT, s.z - hd])
    radius = Math.max(radius, Math.abs(s.x) + hw)
  }
  const us = points.map(([x, y, z]) => dot(CAMERA_RIGHT, x, y, z))
  const vs = points.map(([x, y, z]) => dot(CAMERA_UP, x, y, z))
  const [minU, maxU, minV, maxV] = [
    Math.min(...us),
    Math.max(...us),
    Math.min(...vs),
    Math.max(...vs),
  ]
  const [midU, midV] = [(minU + maxU) / 2, (minV + maxV) / 2]
  const zoom = Math.min(
    MAX_ZOOM,
    (view.width - FRAME_MARGIN_PX * 2) / (maxU - minU),
    (view.height - FRAME_MARGIN_PX * 2) / (maxV - minV),
  )

  return {
    sites,
    hubZ,
    zoom,
    cellPx: CELL_WIDTH * zoom,
    midU,
    midV,
    center: [
      CAMERA_RIGHT[0] * midU + CAMERA_UP[0] * midV,
      CAMERA_RIGHT[1] * midU + CAMERA_UP[1] * midV,
      CAMERA_RIGHT[2] * midU + CAMERA_UP[2] * midV,
    ],
    radius,
  }
}

/** Tries each row width and keeps the one that lets the scene render largest in this view. */
export function layoutTwin(sites: TwinSite[], view: ViewSize): TwinLayout {
  const zones = sites.map(shapeZone)
  const gateways = zones.filter((z) => z.site.gatewayId)
  const rest = zones.filter((z) => !z.site.gatewayId)
  const narrowest = Math.max(rowWidth(gateways), ...rest.map((z) => z.width), CELL_WIDTH)
  const widest = Math.max(narrowest, rowWidth(rest))

  let best = arrange(packRows(gateways, rest, narrowest), view)
  for (let width = narrowest + 1; width <= widest + 1; width += 1) {
    const candidate = arrange(packRows(gateways, rest, width), view)
    if (candidate.zoom > best.zoom) best = candidate
  }
  return best
}

/** Pixel position of a world point. The camera is orthographic, so this is linear. */
export function projectToView(
  layout: TwinLayout,
  view: ViewSize,
  [x, y, z]: [number, number, number],
): { left: number; top: number } {
  return {
    left: view.width / 2 + layout.zoom * (dot(CAMERA_RIGHT, x, y, z) - layout.midU),
    top: view.height / 2 - layout.zoom * (dot(CAMERA_UP, x, y, z) - layout.midV),
  }
}
