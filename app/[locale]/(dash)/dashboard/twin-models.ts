import type { ResolvedKind } from '@/lib/device-kind'

export interface ModelPart {
  size: [number, number, number]
  position: [number, number, number]
  tone: 'body' | 'accent'
}

const part = (
  tone: ModelPart['tone'],
  size: ModelPart['size'],
  position: ModelPart['position'],
): ModelPart => ({ tone, size, position })

// Every model is made of boxes so the whole scene can share one instanced draw call.
// Models stand on y = 0 with their front on +z, which faces the camera.
export const DEVICE_MODELS: Record<ResolvedKind, ModelPart[]> = {
  server: [
    part('body', [0.62, 0.95, 0.62], [0, 0.475, 0]),
    part('accent', [0.64, 0.05, 0.64], [0, 0.3, 0]),
    part('accent', [0.64, 0.05, 0.64], [0, 0.55, 0]),
    part('accent', [0.64, 0.05, 0.64], [0, 0.8, 0]),
  ],
  vm: [
    part('body', [0.46, 0.46, 0.46], [-0.18, 0.23, 0.1]),
    part('body', [0.46, 0.46, 0.46], [0.22, 0.23, -0.1]),
    part('accent', [0.46, 0.4, 0.46], [0.02, 0.66, 0]),
  ],
  nas: [
    part('body', [0.78, 0.62, 0.5], [0, 0.31, 0]),
    part('accent', [0.14, 0.46, 0.02], [-0.22, 0.31, 0.26]),
    part('accent', [0.14, 0.46, 0.02], [0, 0.31, 0.26]),
    part('accent', [0.14, 0.46, 0.02], [0.22, 0.31, 0.26]),
  ],
  desktop: [
    part('accent', [0.42, 0.04, 0.28], [0, 0.02, 0]),
    part('accent', [0.12, 0.24, 0.1], [0, 0.14, 0]),
    part('body', [0.88, 0.54, 0.07], [0, 0.5, 0]),
    part('accent', [0.78, 0.44, 0.02], [0, 0.5, 0.04]),
  ],
  laptop: [
    part('body', [0.78, 0.04, 0.5], [0, 0.02, 0.12]),
    part('body', [0.78, 0.48, 0.04], [0, 0.26, -0.13]),
    part('accent', [0.68, 0.38, 0.02], [0, 0.26, -0.1]),
  ],
  phone: [
    part('body', [0.36, 0.68, 0.07], [0, 0.34, 0]),
    part('accent', [0.29, 0.56, 0.02], [0, 0.35, 0.04]),
  ],
  tablet: [
    part('body', [0.6, 0.76, 0.06], [0, 0.38, 0]),
    part('accent', [0.52, 0.66, 0.02], [0, 0.38, 0.035]),
  ],
  router: [
    part('body', [0.78, 0.16, 0.5], [0, 0.08, 0]),
    part('accent', [0.04, 0.5, 0.04], [-0.3, 0.41, -0.18]),
    part('accent', [0.04, 0.5, 0.04], [0.3, 0.41, -0.18]),
    part('accent', [0.5, 0.03, 0.02], [0, 0.08, 0.26]),
  ],
  camera: [
    part('accent', [0.12, 0.42, 0.12], [0, 0.21, 0]),
    part('body', [0.32, 0.28, 0.66], [0, 0.56, 0.08]),
    part('accent', [0.2, 0.18, 0.04], [0, 0.56, 0.42]),
  ],
  printer: [
    part('body', [0.8, 0.42, 0.6], [0, 0.21, 0]),
    part('accent', [0.5, 0.2, 0.04], [0, 0.52, -0.2]),
    part('accent', [0.5, 0.03, 0.26], [0, 0.2, 0.42]),
  ],
  sbc: [
    part('body', [0.8, 0.05, 0.56], [0, 0.025, 0]),
    part('accent', [0.24, 0.1, 0.24], [-0.14, 0.1, 0]),
    part('accent', [0.16, 0.14, 0.3], [0.26, 0.12, 0]),
  ],
  iot: [
    part('body', [0.52, 0.18, 0.52], [0, 0.09, 0]),
    part('accent', [0.22, 0.03, 0.22], [0, 0.195, 0]),
    part('accent', [0.04, 0.44, 0.04], [0.18, 0.4, -0.18]),
  ],
  industrial: [
    part('body', [0.72, 0.7, 0.3], [0, 0.35, 0]),
    part('accent', [0.5, 0.14, 0.02], [0, 0.5, 0.16]),
    part('accent', [0.5, 0.2, 0.02], [0, 0.2, 0.16]),
    part('accent', [0.8, 0.06, 0.1], [0, 0.03, 0]),
  ],
  other: [
    part('body', [0.6, 0.42, 0.6], [0, 0.21, 0]),
    part('accent', [0.62, 0.05, 0.1], [0, 0.42, 0]),
  ],
  unset: [part('body', [0.5, 0.5, 0.5], [0, 0.25, 0])],
}

export const modelHeight = (kind: ResolvedKind) =>
  Math.max(...DEVICE_MODELS[kind].map((p) => p.position[1] + p.size[1] / 2))
