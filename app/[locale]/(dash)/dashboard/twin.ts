import type { ResolvedKind } from '@/lib/device-kind'

export interface TwinNode {
  id: string
  kind: ResolvedKind
  name: string
  note: string | null
  ip: string | null
  lanIp: string | null
  online: boolean
  tags: string[]
  lastSeen: string
}

/**
 * One platform in the scene: an approved subnet with its gateway, a /24 seen in reported LAN addresses,
 * or, with a null `cidr`, the nodes that report no usable LAN address.
 */
export interface TwinSite {
  key: string
  cidr: string | null
  gatewayId: string | null
  gatewayName: string | null
  serving: boolean
  nodes: TwinNode[]
}

export interface TwinNetwork {
  sites: TwinSite[]
}
