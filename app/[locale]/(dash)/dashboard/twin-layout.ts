import type { TwinNode, TwinSite } from './twin'

const SPACING = 1.7
const PADDING = 1.5
const SITE_GAP = 1.6
const HUB_CLEARANCE = 2.2
const RING_ASPECT = 2.1

export const HUB_RADIUS = 1.1
export const PLATFORM_HEIGHT = 0.3

/** Unit vectors of the fixed isometric camera: 45 degree azimuth, atan(1/sqrt(2)) elevation. */
export const CAMERA_DIR = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)] as const
const CAMERA_RIGHT = [Math.SQRT1_2, 0, -Math.SQRT1_2] as const
const CAMERA_UP = [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)] as const

export interface PlacedNode {
  node: TwinNode
  x: number
  z: number
}

export interface PlacedSite {
  site: TwinSite
  x: number
  z: number
  size: number
  nodes: PlacedNode[]
}

export interface TwinLayout {
  sites: PlacedSite[]
  /** World point the camera looks at, and the scene's projected size in world units. */
  center: [number, number, number]
  midU: number
  midV: number
  width: number
  height: number
  /** Radius of the ground area, used to size the shadow camera. */
  radius: number
}

function placeNodes(site: TwinSite): { size: number; nodes: PlacedNode[] } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(site.nodes.length)))
  const rows = Math.max(1, Math.ceil(site.nodes.length / cols))
  const size = Math.max(cols, rows) * SPACING + PADDING
  const nodes = site.nodes.map((node, i) => ({
    node,
    x: ((i % cols) - (cols - 1) / 2) * SPACING,
    z: (Math.floor(i / cols) - (rows - 1) / 2) * SPACING,
  }))
  return { size, nodes }
}

/** Where zone `i` of `count` sits on an ellipse that fills a wide card: long axis left to right on screen. */
function ringPoint(i: number, count: number, radius: number): [number, number] {
  const angle = (i / count) * Math.PI * 2 - Math.PI / 2
  const across = Math.cos(angle) * radius * RING_ASPECT
  const depth = Math.sin(angle) * radius
  return [Math.SQRT1_2 * (across + depth), Math.SQRT1_2 * (depth - across)]
}

function ringRadius(sizes: number[]): number {
  const reach = (size: number) => (size * Math.SQRT2) / 2
  const fits = (radius: number) => {
    const points = sizes.map((_, i) => ringPoint(i, sizes.length, radius))
    return points.every(([x, z], i) => {
      if (Math.hypot(x, z) < reach(sizes[i]) + HUB_RADIUS + HUB_CLEARANCE) return false
      return points.every(([ox, oz], j) => {
        return j <= i || Math.hypot(x - ox, z - oz) >= reach(sizes[i]) + reach(sizes[j]) + SITE_GAP
      })
    })
  }
  let radius = 1
  while (!fits(radius)) radius += 0.25
  return radius
}

const dot = (a: readonly number[], x: number, y: number, z: number) =>
  a[0] * x + a[1] * y + a[2] * z

export function layoutTwin(sites: TwinSite[]): TwinLayout {
  const placed = sites.map(placeNodes)
  const radius = ringRadius(placed.map((p) => p.size))
  const result: PlacedSite[] = placed.map((p, i) => {
    const [x, z] = ringPoint(i, sites.length, radius)
    return {
      site: sites[i],
      x,
      z,
      size: p.size,
      nodes: p.nodes,
    }
  })

  const points: [number, number, number][] = [
    [-HUB_RADIUS, 0, -HUB_RADIUS],
    [HUB_RADIUS, 2, HUB_RADIUS],
  ]
  for (const s of result) {
    const half = s.size / 2
    for (const dx of [-half, half]) {
      for (const dz of [-half, half]) {
        points.push([s.x + dx, 0, s.z + dz], [s.x + dx, 1.6, s.z + dz])
      }
    }
  }
  const us = points.map(([x, y, z]) => dot(CAMERA_RIGHT, x, y, z))
  const vs = points.map(([x, y, z]) => dot(CAMERA_UP, x, y, z))
  const midU = (Math.min(...us) + Math.max(...us)) / 2
  const midV = (Math.min(...vs) + Math.max(...vs)) / 2

  return {
    sites: result,
    midU,
    midV,
    center: [
      CAMERA_RIGHT[0] * midU + CAMERA_UP[0] * midV,
      CAMERA_RIGHT[1] * midU + CAMERA_UP[1] * midV,
      CAMERA_RIGHT[2] * midU + CAMERA_UP[2] * midV,
    ],
    width: Math.max(...us) - Math.min(...us),
    height: Math.max(...vs) - Math.min(...vs),
    radius: radius * RING_ASPECT + Math.max(0, ...placed.map((p) => p.size)),
  }
}

export interface ViewSize {
  width: number
  height: number
}

export function fitZoom(layout: TwinLayout, view: ViewSize, marginPx: number): number {
  return Math.min(
    (view.width - marginPx * 2) / layout.width,
    (view.height - marginPx * 2) / layout.height,
  )
}

/** Pixel position of a world point. The camera is orthographic, so this is linear. */
export function projectToView(
  layout: TwinLayout,
  view: ViewSize,
  zoom: number,
  [x, y, z]: [number, number, number],
): { left: number; top: number } {
  return {
    left: view.width / 2 + zoom * (dot(CAMERA_RIGHT, x, y, z) - layout.midU),
    top: view.height / 2 - zoom * (dot(CAMERA_UP, x, y, z) - layout.midV),
  }
}
