import type { TwinNode, TwinSite } from './twin'

const CELL_WIDTH = 3
const CELL_DEPTH = 2.8
const PADDING = 0.5
const ZONE_GAP = 0.8
/** Zones lean wide because the card is wide and depth is foreshortened anyway. */
const ZONE_ASPECT = 2.2
const ROW_GAP = 1.9
const HUB_ROW_DEPTH = 2.6
const FRAME_MARGIN_PX = 16
const MAX_FIT_ZOOM = 44
const MAX_ROW_WIDTH_TRIES = 40
/** Tallest thing in the scene, so the frame leaves room above the back row. */
export const SCENE_HEIGHT = 1.6
const ELEVATION = (42 * Math.PI) / 180
const DEVICE_OFFSET_Z = -0.15

export const HUB_RADIUS = 1.1
export const PLATFORM_HEIGHT = 0.3
export const PLATFORM_TOP = PLATFORM_HEIGHT / 2
/** How far in front of a device's centre its label starts. */
export const LABEL_OFFSET_Z = 0.55
/** Labels are laid out once at this scale, then the whole layer is scaled with a CSS transform. */
export const LABEL_ZOOM = 36
export const LABEL_WIDTH_PX = CELL_WIDTH * LABEL_ZOOM - 6

/** Unit vectors of the fixed camera, which looks straight ahead and down. */
export const CAMERA_DIR = [0, Math.sin(ELEVATION), Math.cos(ELEVATION)] as const
export const CAMERA_RIGHT = [1, 0, 0] as const
export const CAMERA_UP = [0, Math.cos(ELEVATION), -Math.sin(ELEVATION)] as const

export interface ViewSize {
  width: number
  height: number
}

export interface PlacedNode {
  node: TwinNode
  isGateway: boolean
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
  hasHub: boolean
  hubZ: number
  /** Scene bounds on the camera's right and up axes. */
  minU: number
  maxU: number
  minV: number
  maxV: number
  /** Half the ground extent, used to size the shadow camera. */
  radius: number
}

type Zone = Omit<PlacedSite, 'x' | 'z'>

function shapeZone(site: TwinSite): Zone {
  const gatewayIds = new Set(site.gateways.map((g) => g.id))
  const count = Math.max(1, site.nodes.length)
  const cols = Math.min(count, Math.ceil(Math.sqrt(count * ZONE_ASPECT)))
  const rows = Math.ceil(count / cols)
  return {
    site,
    width: cols * CELL_WIDTH + PADDING * 2,
    depth: rows * CELL_DEPTH + PADDING,
    nodes: site.nodes.map((node, i) => ({
      node,
      isGateway: gatewayIds.has(node.id),
      x: ((i % cols) - (cols - 1) / 2) * CELL_WIDTH,
      z: (Math.floor(i / cols) - (rows - 1) / 2) * CELL_DEPTH + DEVICE_OFFSET_Z,
    })),
  }
}

/** Gateway zones come first, in rows of their own, so hub links rarely cross other zones. */
function packRows(gateways: Zone[], rest: Zone[], maxWidth: number): { rows: Zone[][] } {
  const rows: Zone[][] = []
  for (const group of [gateways, rest]) {
    let current: Zone[] = []
    let width = 0
    for (const zone of group) {
      if (current.length && width + ZONE_GAP + zone.width > maxWidth) {
        rows.push(current)
        current = []
        width = 0
      }
      width += (current.length ? ZONE_GAP : 0) + zone.width
      current.push(zone)
    }
    if (current.length) rows.push(current)
  }
  return { rows }
}

const dot = (a: readonly number[], x: number, y: number, z: number) =>
  a[0] * x + a[1] * y + a[2] * z

export const axisU = (x: number, y: number, z: number) => dot(CAMERA_RIGHT, x, y, z)
export const axisV = (x: number, y: number, z: number) => dot(CAMERA_UP, x, y, z)

function arrange(rows: Zone[][], hasHub: boolean): TwinLayout {
  const hubDepth = hasHub ? HUB_ROW_DEPTH : 0
  let totalDepth = hubDepth
  for (const row of rows) {
    let depth = 0
    for (const zone of row) depth = Math.max(depth, zone.depth)
    totalDepth += depth + ROW_GAP
  }

  const sites: PlacedSite[] = []
  let cursor = -totalDepth / 2 + hubDepth + ROW_GAP / 2
  for (const row of rows) {
    const rowWidth = row.reduce((sum, z) => sum + z.width, 0) + ZONE_GAP * (row.length - 1)
    let depth = 0
    let left = -rowWidth / 2
    for (const zone of row) {
      sites.push({ ...zone, x: left + zone.width / 2, z: cursor + zone.depth / 2 })
      left += zone.width + ZONE_GAP
      depth = Math.max(depth, zone.depth)
    }
    cursor += depth + ROW_GAP
  }

  const hubZ = -totalDepth / 2 + HUB_RADIUS
  let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity]
  let radius = totalDepth / 2
  const include = (x: number, y: number, z: number) => {
    const [u, v] = [axisU(x, y, z), axisV(x, y, z)]
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }
  if (hasHub) {
    include(-HUB_RADIUS, SCENE_HEIGHT, hubZ - HUB_RADIUS)
    include(HUB_RADIUS, 0, hubZ + HUB_RADIUS)
  }
  for (const s of sites) {
    const [hw, hd] = [s.width / 2, s.depth / 2]
    include(s.x - hw, 0, s.z + hd)
    include(s.x + hw, SCENE_HEIGHT, s.z - hd)
    radius = Math.max(radius, Math.abs(s.x) + hw)
  }
  return { sites, hasHub, hubZ, minU, maxU, minV, maxV, radius }
}

export function fitZoom(layout: TwinLayout, view: ViewSize): number {
  return Math.min(
    MAX_FIT_ZOOM,
    (view.width - FRAME_MARGIN_PX * 2) / Math.max(layout.maxU - layout.minU, 1),
    (view.height - FRAME_MARGIN_PX * 2) / Math.max(layout.maxV - layout.minV, 1),
  )
}

/** Tries a spread of row widths and keeps the one that lets the scene render largest in this view. */
export function layoutTwin(sites: TwinSite[], view: ViewSize): TwinLayout {
  const zones = sites.map(shapeZone)
  const gateways = zones.filter((z) => z.site.gateways.length)
  const rest = zones.filter((z) => !z.site.gateways.length)
  const hasHub = gateways.length > 0
  const total = zones.reduce((sum, z) => sum + z.width + ZONE_GAP, 0)
  const narrowest = Math.max(CELL_WIDTH, ...zones.map((z) => z.width))
  const step = Math.max(1, (total - narrowest) / MAX_ROW_WIDTH_TRIES)

  let best: TwinLayout | null = null
  let bestZoom = -Infinity
  for (let width = narrowest; width <= total + step; width += step) {
    const candidate = arrange(packRows(gateways, rest, width).rows, hasHub)
    const zoom = fitZoom(candidate, view)
    if (zoom > bestZoom) {
      best = candidate
      bestZoom = zoom
    }
  }
  return best ?? arrange([], hasHub)
}

/** Position inside the label layer, which the camera moves and scales as one piece. */
export function labelPosition(x: number, y: number, z: number) {
  return { left: axisU(x, y, z) * LABEL_ZOOM, top: -axisV(x, y, z) * LABEL_ZOOM }
}
