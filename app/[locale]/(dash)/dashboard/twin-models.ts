export interface ModelPart {
  size: [number, number, number]
  position: [number, number, number]
  tone: 'body' | 'screen' | 'detail'
}

const part = (
  tone: ModelPart['tone'],
  size: ModelPart['size'],
  position: ModelPart['position'],
): ModelPart => ({ tone, size, position })

const terminal: ModelPart[] = [
  part('body', [0.66, 0.72, 0.56], [0, 0.36, 0]),
  part('screen', [0.54, 0.5, 0.02], [0, 0.42, 0.29]),
  part('detail', [0.3, 0.035, 0.01], [-0.1, 0.58, 0.305]),
  part('detail', [0.4, 0.035, 0.01], [-0.05, 0.51, 0.305]),
  part('detail', [0.2, 0.035, 0.01], [-0.15, 0.44, 0.305]),
  part('detail', [0.06, 0.05, 0.01], [-0.22, 0.35, 0.305]),
  part('detail', [0.3, 0.03, 0.01], [0, 0.09, 0.285]),
]

// Every model is made of boxes so the whole scene can share one instanced draw call.
// Models stand on y = 0 with their front on +z, which faces the camera.
const SYSTEM_MODELS: Record<string, ModelPart[]> = {
  windows: [
    part('body', [0.42, 0.04, 0.28], [0, 0.02, 0]),
    part('body', [0.12, 0.2, 0.08], [0, 0.14, 0]),
    part('body', [0.92, 0.58, 0.07], [0, 0.52, 0]),
    part('screen', [0.84, 0.5, 0.02], [0, 0.53, 0.04]),
    part('detail', [0.84, 0.05, 0.01], [0, 0.305, 0.055]),
    part('detail', [0.05, 0.03, 0.01], [-0.38, 0.305, 0.062]),
  ],
  macos: [
    part('body', [0.8, 0.04, 0.5], [0, 0.02, 0.12]),
    part('body', [0.8, 0.5, 0.04], [0, 0.27, -0.13]),
    part('screen', [0.72, 0.42, 0.02], [0, 0.27, -0.1]),
    part('detail', [0.72, 0.03, 0.01], [0, 0.465, -0.085]),
    part('detail', [0.36, 0.05, 0.01], [0, 0.09, -0.085]),
  ],
  ios: [
    part('body', [0.38, 0.72, 0.07], [0, 0.36, 0]),
    part('screen', [0.32, 0.64, 0.02], [0, 0.36, 0.04]),
    part('detail', [0.1, 0.03, 0.01], [0, 0.65, 0.055]),
    ...[-0.08, 0.08].flatMap((x) =>
      [0.54, 0.4, 0.26].map((y) => part('detail', [0.09, 0.09, 0.01], [x, y, 0.055])),
    ),
  ],
  android: [
    part('body', [0.38, 0.76, 0.07], [0, 0.38, 0]),
    part('screen', [0.32, 0.64, 0.02], [0, 0.4, 0.04]),
    part('detail', [0.28, 0.1, 0.01], [0, 0.6, 0.055]),
    ...[-0.09, 0, 0.09].map((x) => part('detail', [0.05, 0.03, 0.01], [x, 0.05, 0.045])),
  ],
  linux: terminal,
  freebsd: terminal,
}

const UNKNOWN_MODEL = [part('body', [0.6, 0.6, 0.6], [0, 0.3, 0])]

/** The model only follows the OS the client reports. An unlisted or missing OS gets a plain box. */
export const systemModel = (os: string | null) =>
  (os && SYSTEM_MODELS[os.toLowerCase()]) || UNKNOWN_MODEL

export const modelHeight = (os: string | null) =>
  Math.max(...systemModel(os).map((p) => p.position[1] + p.size[1] / 2))
