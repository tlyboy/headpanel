export interface ModelPart {
  size: [number, number, number]
  position: [number, number, number]
  tone: 'body' | 'accent'
}

const SERVER: ModelPart[] = [
  { size: [0.62, 0.95, 0.62], position: [0, 0.475, 0], tone: 'body' },
  { size: [0.64, 0.05, 0.64], position: [0, 0.3, 0], tone: 'accent' },
  { size: [0.64, 0.05, 0.64], position: [0, 0.55, 0], tone: 'accent' },
  { size: [0.64, 0.05, 0.64], position: [0, 0.8, 0], tone: 'accent' },
]

const PC: ModelPart[] = [
  { size: [0.42, 0.04, 0.28], position: [0, 0.02, 0], tone: 'accent' },
  { size: [0.12, 0.24, 0.1], position: [0, 0.14, 0], tone: 'accent' },
  { size: [0.88, 0.54, 0.07], position: [0, 0.5, 0], tone: 'body' },
  { size: [0.78, 0.44, 0.02], position: [0, 0.5, 0.04], tone: 'accent' },
]

const PHONE: ModelPart[] = [
  { size: [0.36, 0.68, 0.07], position: [0, 0.34, 0], tone: 'body' },
  { size: [0.29, 0.56, 0.02], position: [0, 0.35, 0.04], tone: 'accent' },
]

const UNKNOWN: ModelPart[] = [{ size: [0.55, 0.55, 0.55], position: [0, 0.275, 0], tone: 'body' }]

// Every model is made of boxes so the whole scene can share one instanced draw call.
// Models stand on y = 0 with their front on +z, which faces the camera.
const SYSTEM_MODELS: Record<string, ModelPart[]> = {
  windows: PC,
  macos: PC,
  ios: PHONE,
  android: PHONE,
  linux: SERVER,
  freebsd: SERVER,
}

/** The model only follows the OS the client reports. An unlisted or missing OS gets a plain box. */
export const systemModel = (os: string | null) => (os && SYSTEM_MODELS[os.toLowerCase()]) || UNKNOWN

export const modelHeight = (os: string | null) =>
  Math.max(...systemModel(os).map((p) => p.position[1] + p.size[1] / 2))
