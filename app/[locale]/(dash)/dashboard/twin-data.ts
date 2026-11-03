import 'server-only'

import { inferDeviceKind } from '@/lib/device-kind'
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

  const discovered = new Map<string, TwinSite>()
  const discoveredSite = (ip: string) => {
    const cidr = `${ip.split('.').slice(0, 3).join('.')}.0/24`
    let site = discovered.get(cidr)
    if (!site) {
      site = {
        key: cidr,
        cidr,
        gatewayId: null,
        gatewayName: null,
        serving: true,
        nodes: [],
      }
      discovered.set(cidr, site)
    }
    return site
  }

  for (const n of nodes) {
    const info = netInfo.get(n.id)
    const lanIps = info?.lanIps ?? []
    const node: TwinNode = {
      id: n.id,
      kind: n.deviceKind ?? inferDeviceKind(info),
      name: n.givenName,
      note: n.note,
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
    // A .1 is usually a bridge or a gateway that STUN reported, not this machine's own address
    const lanIp = lanIps.find((ip) => !ip.endsWith('.1'))
    if (home) home.nodes.push(node)
    else if (lanIp) discoveredSite(lanIp).nodes.push(node)
    else other.nodes.push(node)
  }

  const byCidr = (a: TwinSite, b: TwinSite) =>
    (a.cidr ?? '').localeCompare(b.cidr ?? '', undefined, { numeric: true })
  const all = [
    ...sites,
    ...[...discovered.values()].sort((a, b) => b.nodes.length - a.nodes.length || byCidr(a, b)),
    ...(other.nodes.length ? [other] : []),
  ]
  for (const site of all) site.nodes.sort(byGatewayThenStatus(site.gatewayId))
  return { sites: all }
}
