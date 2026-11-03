import 'server-only'

import { onlyIpv4 } from '@/lib/format'
import { ipInCidr, type NodeNetInfo } from '@/lib/headscale-db'
import type { MergedNode } from '@/lib/nodes-sync'
import type { TwinNetwork, TwinNode, TwinSite } from './twin'

const UNPLACED_KEY = 'unplaced'

const isLanRoute = (route: string) => !route.includes(':') && !route.endsWith('/0')
const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

function emptySite(key: string, location: string | null, cidrs: string[]): TwinSite {
  return { key, location, cidrs, gateways: [], nodes: [] }
}

/** Gateways first, then named locations, then subnets by size, with unplaced nodes last. */
function compareSites(a: TwinSite, b: TwinSite) {
  const rank = (s: TwinSite) =>
    s.key === UNPLACED_KEY ? 3 : s.gateways.length ? 0 : s.location ? 1 : 2
  return (
    rank(a) - rank(b) ||
    b.nodes.length - a.nodes.length ||
    compareText(a.location ?? a.cidrs[0] ?? '', b.location ?? b.cidrs[0] ?? '')
  )
}

export function buildTwin(nodes: MergedNode[], netInfo: Map<string, NodeNetInfo>): TwinNetwork {
  const sites = new Map<string, TwinSite>()
  const siteFor = (key: string, location: string | null, cidrs: string[]) => {
    let site = sites.get(key)
    if (!site) {
      site = emptySite(key, location, cidrs)
      sites.set(key, site)
    }
    return site
  }
  const locationSite = (name: string) => siteFor(`location:${name}`, name, [])

  const served = new Set(nodes.flatMap((n) => n.subnetRoutes))
  const siteByRoute = new Map<string, TwinSite>()
  const toTwinNode = (n: MergedNode): TwinNode => {
    const info = netInfo.get(n.id)
    return {
      id: n.id,
      name: n.givenName,
      note: n.note,
      location: n.location,
      os: info?.os ?? null,
      deviceModel: info?.deviceModel ?? null,
      ip: onlyIpv4(n.ipAddresses)[0] ?? null,
      lanIp: info?.lanIps[0] ?? null,
      online: n.online,
      tags: n.tags.map((tag) => tag.replace(/^tag:/, '')),
      lastSeen: n.lastSeen,
    }
  }

  const routersFirst = [...nodes].sort(
    (a, b) => Number(b.approvedRoutes.length > 0) - Number(a.approvedRoutes.length > 0),
  )
  for (const n of routersFirst) {
    const routes = n.approvedRoutes.filter(isLanRoute).sort(compareText)
    if (routes.length) {
      const site =
        (n.location && locationSite(n.location)) ||
        routes.map((r) => siteByRoute.get(r)).find(Boolean) ||
        siteFor(routes[0], null, [])
      for (const cidr of routes) {
        if (!siteByRoute.has(cidr)) siteByRoute.set(cidr, site)
        if (!site.cidrs.includes(cidr)) site.cidrs.push(cidr)
        site.gateways.push({ id: n.id, name: n.givenName, cidr, serving: served.has(cidr) })
      }
      site.nodes.push(toTwinNode(n))
      continue
    }

    const lanIps = netInfo.get(n.id)?.lanIps ?? []
    let site: TwinSite | undefined = n.location ? locationSite(n.location) : undefined
    if (!site) {
      for (const ip of lanIps) {
        const route = [...siteByRoute.keys()].find((cidr) => ipInCidr(ip, cidr))
        if (route) {
          site = siteByRoute.get(route)
          break
        }
      }
    }
    if (!site) {
      // A .1 is usually a bridge or the gateway itself, so it says nothing about this machine's subnet
      const ip = lanIps.find((candidate) => !candidate.endsWith('.1'))
      const cidr = ip && `${ip.split('.').slice(0, 3).join('.')}.0/24`
      site = cidr ? siteFor(cidr, null, [cidr]) : siteFor(UNPLACED_KEY, null, [])
    }
    site.nodes.push(toTwinNode(n))
  }

  const all = [...sites.values()].filter((s) => s.nodes.length).sort(compareSites)
  for (const site of all) {
    const gatewayIds = new Set(site.gateways.map((g) => g.id))
    site.nodes.sort(
      (a, b) =>
        Number(gatewayIds.has(b.id)) - Number(gatewayIds.has(a.id)) ||
        Number(b.online) - Number(a.online) ||
        compareText(a.name, b.name),
    )
  }
  return { sites: all }
}
