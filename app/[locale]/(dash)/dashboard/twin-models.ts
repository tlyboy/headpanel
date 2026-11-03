import type { ResolvedKind } from '@/lib/device-kind'

export interface ModelPart {
  size: [number, number, number]
  position: [number, number, number]
  tone: 'body' | 'accent'
}

// Models stand on y = 0 with their front on +z. The scene turns them 45 degrees to face the camera.
export const DEVICE_MODELS: Record<ResolvedKind, ModelPart[]> = {
  server: [
    { size: [0.62, 0.95, 0.62], position: [0, 0.475, 0], tone: 'body' },
    { size: [0.64, 0.05, 0.64], position: [0, 0.3, 0], tone: 'accent' },
    { size: [0.64, 0.05, 0.64], position: [0, 0.55, 0], tone: 'accent' },
    { size: [0.64, 0.05, 0.64], position: [0, 0.8, 0], tone: 'accent' },
  ],
  pc: [
    { size: [0.42, 0.04, 0.28], position: [0, 0.02, 0], tone: 'accent' },
    { size: [0.12, 0.24, 0.1], position: [0, 0.14, 0], tone: 'accent' },
    { size: [0.88, 0.54, 0.07], position: [0, 0.5, 0], tone: 'body' },
    { size: [0.78, 0.44, 0.02], position: [0, 0.5, 0.04], tone: 'accent' },
  ],
  phone: [
    { size: [0.36, 0.68, 0.07], position: [0, 0.34, 0], tone: 'body' },
    { size: [0.29, 0.56, 0.02], position: [0, 0.35, 0.04], tone: 'accent' },
  ],
  iot: [
    { size: [0.52, 0.18, 0.52], position: [0, 0.09, 0], tone: 'body' },
    { size: [0.22, 0.03, 0.22], position: [0, 0.195, 0], tone: 'accent' },
    { size: [0.04, 0.44, 0.04], position: [0.18, 0.4, -0.18], tone: 'accent' },
  ],
  unknown: [{ size: [0.55, 0.55, 0.55], position: [0, 0.275, 0], tone: 'body' }],
}

export const modelHeight = (kind: ResolvedKind) =>
  Math.max(...DEVICE_MODELS[kind].map((p) => p.position[1] + p.size[1] / 2))
