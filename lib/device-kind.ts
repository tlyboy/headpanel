export const DEVICE_KINDS = ['server', 'pc', 'phone', 'iot'] as const
export type DeviceKind = (typeof DEVICE_KINDS)[number]

/** What the panel shows. `unknown` only appears when the Headscale database is out of reach. */
export type ResolvedKind = DeviceKind | 'unknown'

export const isDeviceKind = (value: string): value is DeviceKind =>
  (DEVICE_KINDS as readonly string[]).includes(value)

// Tailscale reports DeviceModel on Linux only for boards that expose a model name, such as
// RDK X5 and LubanCat; servers and VMs leave it empty.
export function inferDeviceKind(
  info: { os: string | null; deviceModel: string | null } | undefined,
): ResolvedKind {
  switch (info?.os?.toLowerCase()) {
    case 'ios':
    case 'android':
      return 'phone'
    case 'windows':
    case 'macos':
      return 'pc'
    case 'linux':
      return info?.deviceModel ? 'iot' : 'server'
    default:
      return 'unknown'
  }
}
