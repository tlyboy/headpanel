import type { TwinNetwork, TwinNode } from './twin'

export type Selector =
  | { kind: 'all' }
  | { kind: 'tag'; tag: string }
  | { kind: 'cidr'; cidr: string }
  | { kind: 'tagged' }
  | { kind: 'member' }

export interface AccessRule {
  src: Selector[]
  dst: { selector: Selector; ports: string }[]
}

/**
 * The rules a viewer can evaluate locally. Null when there is no readable rule list, because
 * "no rules" must not be shown as "no access": what Headscale does then is not this panel's call.
 */
export interface AccessPolicy {
  rules: AccessRule[]
  /** Everything we could not interpret. Real access may differ from what we show. */
  unknown: string[]
}

/** Past this many, lines hide the scene instead of explaining it, so only the highlight remains. */
export const MAX_ACCESS_LINKS = 60

export type TwinSelection = { kind: 'node'; id: string } | { kind: 'tag'; tag: string }

export interface AccessPeer {
  node: TwinNode
  via: string[]
  ports: string[]
}

export interface AccessSubnet {
  cidr: string
  via: string[]
  ports: string[]
  /** Null when no approved route carries this range, so nothing can reach it yet. */
  gateway: { name: string; serving: boolean; siteKey: string } | null
}

export interface AccessView {
  selection: TwinSelection
  title: string
  /** The selected device, or null when a tag is selected. */
  source: TwinNode | null
  /** Devices the source can reach, or a tag's members. */
  peers: AccessPeer[]
  subnets: AccessSubnet[]
  policy: AccessPolicy | null
}

/** What the scene needs to draw a selection. Null dims nothing. */
export interface TwinHighlight {
  selectedId: string | null
  lit: Set<string>
  litSites: Set<string>
  linkedIds: string[]
}

function stripHujson(text: string) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      out += text.slice(start, i + 1)
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1
      if (i === 0) throw new SyntaxError('unterminated comment')
    } else if (c === ',') {
      let next = i + 1
      while (/\s/.test(text[next] ?? '')) next++
      if (text[next] !== '}' && text[next] !== ']') out += c
    } else {
      out += c
    }
  }
  return out
}

const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/

function parseCidr(value: string) {
  const match = CIDR_RE.exec(value)
  if (!match) return null
  const octets = match.slice(1, 5).map(Number)
  const bits = match[5] === undefined ? 32 : Number(match[5])
  if (bits > 32 || octets.some((o) => o > 255)) return null
  const address = octets.reduce((sum, o) => sum * 256 + o, 0)
  const size = 2 ** (32 - bits)
  const start = address - (address % size)
  return { start, end: start + size - 1 }
}

function contains(outer: string, inner: string) {
  const [a, b] = [parseCidr(outer), parseCidr(inner)]
  return Boolean(a && b && a.start <= b.start && b.end <= a.end)
}

function overlaps(a: string, b: string) {
  return contains(a, b) || contains(b, a)
}

function parseSelector(token: string, hosts: Record<string, string>): Selector | null {
  if (token === '*') return { kind: 'all' }
  if (token === 'autogroup:tagged') return { kind: 'tagged' }
  if (token === 'autogroup:member') return { kind: 'member' }
  if (token.startsWith('tag:')) return { kind: 'tag', tag: token.slice(4) }
  const address = hosts[token] ?? token
  return parseCidr(address) ? { kind: 'cidr', cidr: address } : null
}

/** Reads a Headscale policy. Returns null when it has no rule list we can evaluate. */
export function parsePolicy(text: string): AccessPolicy | null {
  let policy: Record<string, unknown>
  try {
    policy = JSON.parse(stripHujson(text))
  } catch {
    return null
  }
  if (!Array.isArray(policy?.acls) || policy.acls.length === 0) return null

  const hosts = (policy.hosts ?? {}) as Record<string, string>
  const unknown = new Set<string>()
  if (policy.grants) unknown.add('grants')
  const rules: AccessRule[] = []
  for (const acl of policy.acls as Record<string, unknown>[]) {
    if (acl.action !== 'accept') {
      unknown.add(`action ${String(acl.action)}`)
      continue
    }
    const proto = typeof acl.proto === 'string' ? `${acl.proto}:` : ''
    const src: Selector[] = []
    for (const token of (acl.src ?? []) as string[]) {
      const selector = parseSelector(token, hosts)
      if (selector) src.push(selector)
      else unknown.add(token)
    }
    const dst: AccessRule['dst'] = []
    for (const token of (acl.dst ?? []) as string[]) {
      const colon = token.lastIndexOf(':')
      const selector = colon > 0 ? parseSelector(token.slice(0, colon), hosts) : null
      if (selector) dst.push({ selector, ports: `${proto}${token.slice(colon + 1)}` })
      else unknown.add(token)
    }
    rules.push({ src, dst })
  }
  return { rules, unknown: [...unknown] }
}

function selects(selector: Selector, node: TwinNode) {
  switch (selector.kind) {
    case 'all':
      return true
    case 'tag':
      return node.tags.includes(selector.tag)
    case 'cidr':
      return node.ip !== null && contains(selector.cidr, node.ip)
    case 'tagged':
      return node.tags.length > 0
    case 'member':
      return node.tags.length === 0
  }
}

function viaLabel(selector: Selector) {
  switch (selector.kind) {
    case 'all':
      return '*'
    case 'tag':
      return selector.tag
    case 'cidr':
      return selector.cidr
    case 'tagged':
      return 'autogroup:tagged'
    case 'member':
      return 'autogroup:member'
  }
}

function addTo<T extends { via: string[]; ports: string[] }>(entry: T, via: string, ports: string) {
  if (!entry.via.includes(via)) entry.via.push(via)
  if (!entry.ports.includes(ports)) entry.ports.push(ports)
}

/** Follows the rules out of whatever `isSource` matches. Peers are only collected for a device (`self`). */
function evaluate(
  policy: AccessPolicy,
  network: TwinNetwork,
  isSource: (selector: Selector) => boolean,
  self: TwinNode | null,
) {
  const nodes = network.sites.flatMap((s) => s.nodes)
  const routes = network.sites.flatMap((site) =>
    site.gateways.map((gateway) => ({ gateway, siteKey: site.key })),
  )
  const peers = new Map<string, AccessPeer>()
  const subnets = new Map<string, AccessSubnet>()

  const addSubnet = (
    cidr: string,
    route: (typeof routes)[number] | null,
    via: string,
    ports: string,
  ) => {
    const key = `${cidr}|${route?.gateway.id ?? ''}`
    let entry = subnets.get(key)
    if (!entry) {
      entry = {
        cidr,
        via: [],
        ports: [],
        gateway: route && {
          name: route.gateway.name,
          serving: route.gateway.serving,
          siteKey: route.siteKey,
        },
      }
      subnets.set(key, entry)
    }
    addTo(entry, via, ports)
  }

  for (const rule of policy.rules) {
    const source = rule.src.find(isSource)
    if (!source) continue
    const via = viaLabel(source)
    for (const { selector, ports } of rule.dst) {
      let matchedPeer = false
      if (self) {
        for (const node of nodes) {
          if (node.id === self.id || !selects(selector, node)) continue
          matchedPeer = true
          let peer = peers.get(node.id)
          if (!peer) {
            peer = { node, via: [], ports: [] }
            peers.set(node.id, peer)
          }
          addTo(peer, via, ports)
        }
      }
      if (selector.kind === 'all') {
        for (const route of routes) addSubnet(route.gateway.cidr, route, via, ports)
      } else if (selector.kind === 'cidr') {
        const matching = routes.filter((r) => overlaps(selector.cidr, r.gateway.cidr))
        for (const route of matching) {
          const narrower = contains(route.gateway.cidr, selector.cidr)
          addSubnet(narrower ? selector.cidr : route.gateway.cidr, route, via, ports)
        }
        if (!matching.length && !matchedPeer) addSubnet(selector.cidr, null, via, ports)
      }
    }
  }
  return { peers: [...peers.values()], subnets: [...subnets.values()] }
}

export function buildAccessView(
  network: TwinNetwork,
  policy: AccessPolicy | null,
  selection: TwinSelection,
): AccessView | null {
  const nodes = network.sites.flatMap((s) => s.nodes)
  if (selection.kind === 'node') {
    const source = nodes.find((n) => n.id === selection.id)
    if (!source) return null
    const result = policy
      ? evaluate(policy, network, (s) => selects(s, source), source)
      : { peers: [], subnets: [] }
    return { selection, title: source.note ?? source.name, source, policy, ...result }
  }
  const members = nodes.filter((n) => n.tags.includes(selection.tag))
  if (!members.length) return null
  const { subnets } = policy
    ? evaluate(
        policy,
        network,
        (s) =>
          s.kind === 'all' || s.kind === 'tagged' || (s.kind === 'tag' && s.tag === selection.tag),
        null,
      )
    : { subnets: [] }
  return {
    selection,
    title: selection.tag,
    source: null,
    peers: members.map((node) => ({ node, via: [], ports: [] })),
    subnets,
    policy,
  }
}

export function toHighlight(view: AccessView | null): TwinHighlight | null {
  // Without a readable policy we don't know who is reachable, and dimming everyone would claim nobody is
  if (!view || (view.source && !view.policy)) return null
  const lit = new Set(view.peers.map((p) => p.node.id))
  if (view.source) lit.add(view.source.id)
  return {
    selectedId: view.source?.id ?? null,
    lit,
    litSites: new Set(view.subnets.flatMap((s) => s.gateway?.siteKey ?? [])),
    linkedIds:
      view.source && view.peers.length <= MAX_ACCESS_LINKS ? view.peers.map((p) => p.node.id) : [],
  }
}
