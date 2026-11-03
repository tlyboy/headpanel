import 'server-only'

import { onlyIpv4 } from '@/lib/format'
import { ipInCidr, type NodeNetInfo } from '@/lib/headscale-db'
import type { MergedNode } from '@/lib/nodes-sync'
import type { TwinNetwork, TwinNode, TwinSite } from './twin'

const OTHER_KEY = 'other'

const isLanRoute = (route: string) => !route.includes(':') && !route.endsWith('/0')

function byGatewayThenStatus(gatewayId: string | null) {
  return (a: TwinNode, b: TwinNode) =>
    Number(b.id === gatewayId) - Number(a.id === gatewayId) ||
    Number(b.online) - Number(a.online) ||
    a.name.localeCompare(b.name, undefined, { numeric: true })
}

export function buildTwin(nodes: MergedNode[], netInfo: Map<string, NodeNetInfo>): TwinNetwork {
  const routes = [...new Set(nodes.flatMap((n) => n.approvedRoutes.filter(isLanRoute)))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  )

  const sites: TwinSite[] = routes.map((cidr) => {
    const routers = nodes.filter((n) => n.approvedRoutes.includes(cidr))
    const serving = routers.find((n) => n.subnetRoutes.includes(cidr))
    const gateway = serving ?? routers[0]
    return {
      key: cidr,
      cidr,
      gatewayId: gateway.id,
      gatewayName: gateway.givenName,
      serving: Boolean(serving),
      nodes: [],
    }
  })
  const other: TwinSite = {
    key: OTHER_KEY,
    cidr: null,
    gatewayId: null,
    gatewayName: null,
    serving: true,
    nodes: [],
  }

  for (const n of nodes) {
    const lanIps = netInfo.get(n.id)?.lanIps ?? []
    const node: TwinNode = {
      id: n.id,
      name: n.givenName,
      ip: onlyIpv4(n.ipAddresses)[0] ?? null,
      lanIp: lanIps[0] ?? null,
      online: n.online,
      tags: n.tags.map((tag) => tag.replace(/^tag:/, '')),
      lastSeen: n.lastSeen,
    }
    // A router stands on every subnet it serves, so a two-subnet router is drawn on both platforms.
    const served = sites.filter((s) => n.approvedRoutes.includes(s.cidr ?? ''))
    if (served.length) {
      for (const site of served) site.nodes.push(node)
      continue
    }
    const home = lanIps.map((ip) => sites.find((s) => s.cidr && ipInCidr(ip, s.cidr))).find(Boolean)
    ;(home ?? other).nodes.push(node)
  }

  const all = other.nodes.length ? [...sites, other] : sites
  for (const site of all) site.nodes.sort(byGatewayThenStatus(site.gatewayId))
  return { sites: all }
}
