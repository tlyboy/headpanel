export interface TwinNode {
  id: string
  name: string
  note: string | null
  location: string | null
  /** What the client reports. Shown as is, never used to decide a kind. */
  os: string | null
  deviceModel: string | null
  ip: string | null
  lanIp: string | null
  online: boolean
  tags: string[]
  lastSeen: string
}

export interface TwinGateway {
  id: string
  name: string
  cidr: string
  /** True when any router currently carries this subnet. */
  serving: boolean
}

/**
 * One platform in the scene. A zone is named by a location an admin set, otherwise by its subnets:
 * approved routes, or the /24 of a reported LAN address. A zone with neither holds the unplaced nodes.
 */
export interface TwinSite {
  key: string
  location: string | null
  cidrs: string[]
  gateways: TwinGateway[]
  nodes: TwinNode[]
}

export interface TwinNetwork {
  sites: TwinSite[]
}

/** Keeps only the devices carrying `tag`. A gateway without it stays out too, and empty zones go away. */
export function filterByTag(network: TwinNetwork, tag: string): TwinNetwork {
  const sites = network.sites.flatMap((site) => {
    const nodes = site.nodes.filter((n) => n.tags.includes(tag))
    if (!nodes.length) return []
    const ids = new Set(nodes.map((n) => n.id))
    return [{ ...site, nodes, gateways: site.gateways.filter((g) => ids.has(g.id)) }]
  })
  return { sites }
}

export const isServing = (site: TwinSite) => site.gateways.every((g) => g.serving)
