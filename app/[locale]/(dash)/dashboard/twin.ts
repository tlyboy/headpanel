import type { ResolvedKind } from '@/lib/device-kind'

export interface TwinNode {
  id: string
  kind: ResolvedKind
  name: string
  ip: string | null
  lanIp: string | null
  online: boolean
  tags: string[]
  lastSeen: string
}

/** One platform in the scene. `cidr` is null for the catch-all zone of nodes outside every approved subnet. */
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
