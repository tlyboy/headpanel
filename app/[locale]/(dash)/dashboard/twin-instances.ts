import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import type { TwinColors } from './twin-colors'
import { modelHeight, systemModel } from './twin-models'
import { isServing } from './twin'
import {
  PLATFORM_HEIGHT,
  PLATFORM_TOP,
  type PlacedNode,
  type PlacedSite,
  type TwinLayout,
} from './twin-layout'

export const GATEWAY_PLATE_HEIGHT = 0.06
const GATEWAY_PLATE_SIZE = 1.1
const HIT_BOX_SIZE = 0.95
const ACCENT_SHADE = 0.45
const DOWN_TINT = 0.35

export interface BoxInstance {
  position: [number, number, number]
  size: [number, number, number]
  color: Color
}

export interface HitTarget {
  key: string
  placed: PlacedNode
  x: number
  z: number
}

export interface TwinInstances {
  solids: BoxInstance[]
  hitBoxes: BoxInstance[]
  hitTargets: HitTarget[]
  outlines: BufferGeometry
}

export function gatewayTop(placed: PlacedNode) {
  return PLATFORM_TOP + GATEWAY_PLATE_HEIGHT + modelHeight(placed.node.os)
}

function outlineSite(
  { x, z, width, depth }: PlacedSite,
  color: Color,
  positions: number[],
  colors: number[],
) {
  const [hw, hd] = [width / 2, depth / 2]
  const [top, bottom] = [PLATFORM_TOP, -PLATFORM_HEIGHT / 2]
  const corners: [number, number, number][] = [
    [x - hw, top, z - hd],
    [x + hw, top, z - hd],
    [x + hw, top, z + hd],
    [x - hw, top, z + hd],
    [x - hw, bottom, z + hd],
    [x + hw, bottom, z + hd],
  ]
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [3, 4],
    [4, 5],
    [5, 2],
  ]) {
    positions.push(...corners[a], ...corners[b])
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
  }
}

export function buildInstances(layout: TwinLayout, colors: TwinColors): TwinInstances {
  const online = new Color(colors.success)
  const offline = new Color(colors['muted-foreground'])
  const shades = (body: Color) => ({ body, accent: body.clone().multiplyScalar(ACCENT_SHADE) })
  const onlineTones = shades(online)
  const offlineTones = shades(offline)
  const primary = new Color(colors.primary)
  const platform = new Color(colors.muted)
  const border = new Color(colors.border)
  const destructive = new Color(colors.destructive)
  const downPlatform = platform.clone().lerp(destructive, DOWN_TINT)

  const solids: BoxInstance[] = []
  const hitBoxes: BoxInstance[] = []
  const hitTargets: HitTarget[] = []
  const linePositions: number[] = []
  const lineColors: number[] = []

  for (const placedSite of layout.sites) {
    const { site, x, z, width, depth, nodes } = placedSite
    const serving = isServing(site)
    solids.push({
      position: [x, 0, z],
      size: [width, PLATFORM_HEIGHT, depth],
      color: serving ? platform : downPlatform,
    })
    outlineSite(placedSite, serving ? border : destructive, linePositions, lineColors)

    for (const placed of nodes) {
      const [nx, nz] = [x + placed.x, z + placed.z]
      const baseY = PLATFORM_TOP + (placed.isGateway ? GATEWAY_PLATE_HEIGHT : 0)
      if (placed.isGateway) {
        solids.push({
          position: [nx, PLATFORM_TOP + GATEWAY_PLATE_HEIGHT / 2, nz],
          size: [GATEWAY_PLATE_SIZE, GATEWAY_PLATE_HEIGHT, GATEWAY_PLATE_SIZE],
          color: primary,
        })
      }
      const body = placed.node.online ? online : offline
      const tones = placed.node.online ? onlineTones : offlineTones
      for (const part of systemModel(placed.node.os)) {
        solids.push({
          position: [nx + part.position[0], baseY + part.position[1], nz + part.position[2]],
          size: part.size,
          color: tones[part.tone],
        })
      }
      hitBoxes.push({
        position: [nx, baseY + HIT_BOX_SIZE / 2, nz],
        size: [HIT_BOX_SIZE, HIT_BOX_SIZE, HIT_BOX_SIZE],
        color: body,
      })
      hitTargets.push({ key: `${site.key}/${placed.node.id}`, placed, x: nx, z: nz })
    }
  }

  const outlines = new BufferGeometry()
  outlines.setAttribute('position', new Float32BufferAttribute(linePositions, 3))
  outlines.setAttribute('color', new Float32BufferAttribute(lineColors, 3))
  return { solids, hitBoxes, hitTargets, outlines }
}
