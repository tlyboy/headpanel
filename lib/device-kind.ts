export const DEVICE_KINDS = [
  'server',
  'vm',
  'nas',
  'desktop',
  'laptop',
  'phone',
  'tablet',
  'router',
  'camera',
  'printer',
  'sbc',
  'iot',
  'industrial',
  'other',
] as const
export type DeviceKind = (typeof DEVICE_KINDS)[number]

/** The kind is only ever what an admin chose. `unset` is drawn as a plain block, and nothing guesses it. */
export type ResolvedKind = DeviceKind | 'unset'

export const isDeviceKind = (value: string | null | undefined): value is DeviceKind =>
  (DEVICE_KINDS as readonly (string | null | undefined)[]).includes(value)
