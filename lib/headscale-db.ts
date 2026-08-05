import 'server-only'

import { existsSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

// headscale's REST API does not return node endpoints / host_info (only tailnet IPs and
// route fields), so the only way to get a node's address on its local network is to read its SQLite database directly.
// Tradeoff: this only works when the panel and headscale run on the same machine, and it
// depends on headscale's table structure — so everything here degrades gracefully; if a read fails, treat it as absent and never block the page.

const DEFAULT_DB_PATH = '/var/lib/headscale/db.sqlite'

export interface NodeNetInfo {
  /** Local network addresses, with the ones most likely to be "this machine's local network address" first */
  lanIps: string[]
  /** Subnets advertised by the client (host_info.RoutableIPs), which may not have been approved yet */
  routableIps: string[]
  os: string | null
  clientVersion: string | null
}

function resolveDbPath(): string {
  const explicit = process.env.HEADSCALE_DB_PATH?.trim()
  if (explicit) return explicit
  const configPath = process.env.HEADSCALE_CONFIG_PATH?.trim()
  if (configPath && existsSync(/* turbopackIgnore: true */ configPath)) {
    try {
      const cfg = readFileSync(/* turbopackIgnore: true */ configPath, 'utf8')
      // Consistent with headscale-config.ts: extract YAML with regexes, without a parsing library
      const block = cfg.match(/^database:\n((?:^[ \t]+.*\n?)*)/m)?.[1]
      const p = block?.match(/^[ \t]+path:[ \t]*([^#\n]+).*$/m)?.[1]?.trim()
      if (p) return p
    } catch {
      // Fall back to the default path
    }
  }
  return DEFAULT_DB_PATH
}

function parseIpv4(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

function inCidr(ip: number, cidr: string): boolean {
  const m = cidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/)
  if (!m) return false
  const base = parseIpv4(m[1])
  const len = Number(m[2])
  if (base == null || len > 32) return false
  if (len === 0) return true
  const mask = (0xffffffff << (32 - len)) >>> 0
  return (ip & mask) === (base & mask)
}

// Private subnets. Deliberately exclude 100.64/10 (those are tailnet addresses) and 198.18/15
// (fake IPs used by user-space implementations such as Surge, not real local network addresses).
function isPrivateLan(ip: number): boolean {
  return (
    inCidr(ip, '10.0.0.0/8') ||
    inCidr(ip, '172.16.0.0/12') ||
    inCidr(ip, '192.168.0.0/16')
  )
}

// endpoints contain three kinds of addresses: public egress, real local network IPs, and addresses
// for virtual network interfaces such as Docker/WSL/VMware. In addition, STUN sometimes reports the gateway address (e.g. 192.168.1.1).
// headscale does not distinguish between them, so we can only score them by characteristics and put the ones most likely to be "this machine's local network address" first.
function scoreLanIp(ip: string, routable: string[]): number {
  const n = parseIpv4(ip)
  if (n == null) return -Infinity
  let score = 0
  // Falls within a subnet it advertises itself — the interface it uses as a subnet router is the most trustworthy
  if (routable.some((r) => inCidr(n, r))) score += 100
  // Addresses ending in .1 are usually gateways or virtual bridges (VMware/Hyper-V commonly use x.x.x.1),
  // and gateway mappings reported by STUN look like this too
  if (!ip.endsWith('.1')) score += 50
  // Docker / WSL commonly use 172.16/12
  if (inCidr(n, '172.16.0.0/12')) score -= 30
  // Most common in home/office networks
  if (inCidr(n, '192.168.0.0/16')) score += 10
  return score
}

/** Extract the IPv4 address from an endpoint string ("1.2.3.4:41641" or "[v6]:41641"); return null if none is found */
function endpointToIpv4(ep: string): string | null {
  if (ep.startsWith('[')) return null // IPv6
  const host = ep.slice(0, ep.lastIndexOf(':'))
  return parseIpv4(host) == null ? null : host
}

function extractLanIps(endpointsJson: string, routable: string[]): string[] {
  let list: unknown
  try {
    list = JSON.parse(endpointsJson)
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  for (const ep of list) {
    if (typeof ep !== 'string') continue
    const ip = endpointToIpv4(ep)
    if (!ip) continue
    const n = parseIpv4(ip)
    if (n == null || !isPrivateLan(n)) continue
    seen.add(ip)
  }
  return [...seen].sort(
    (a, b) =>
      scoreLanIp(b, routable) - scoreLanIp(a, routable) ||
      a.localeCompare(b, undefined, { numeric: true }),
  )
}

interface HeadscaleNodeRow {
  id: number | bigint
  endpoints: string | null
  host_info: string | null
}

let cachedDb: Database.Database | null = null
let cachedPath = ''

function openDb(): Database.Database | null {
  const path = resolveDbPath()
  if (cachedDb && cachedPath === path) return cachedDb
  if (!existsSync(/* turbopackIgnore: true */ path)) return null
  try {
    const db = new Database(/* turbopackIgnore: true */ path, {
      readonly: true,
      fileMustExist: true,
    })
    // The table structure changes across headscale versions; if a column is missing, abandon the whole operation rather than throwing partway through
    const cols = db
      .prepare('PRAGMA table_info(nodes)')
      .all() as { name: string }[]
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('endpoints') || !names.has('host_info')) {
      db.close()
      return null
    }
    cachedDb = db
    cachedPath = path
    return db
  } catch {
    return null
  }
}

/**
 * Read each node's local network address and the subnets advertised by its client. The key is the headscale node ID (string,
 * matching node.id in the REST API). Return an empty Map if the read fails — the caller can render it as "no information available"
 * without needing to distinguish between not running on the same machine and headscale having changed its table structure.
 */
export function readNodeNetInfo(): Map<string, NodeNetInfo> {
  const out = new Map<string, NodeNetInfo>()
  const db = openDb()
  if (!db) return out
  let rows: HeadscaleNodeRow[]
  try {
    rows = db
      .prepare('SELECT id, endpoints, host_info FROM nodes')
      .all() as HeadscaleNodeRow[]
  } catch {
    return out
  }
  for (const r of rows) {
    let routable: string[] = []
    let os: string | null = null
    let clientVersion: string | null = null
    if (r.host_info) {
      try {
        const h = JSON.parse(r.host_info) as Record<string, unknown>
        if (Array.isArray(h.RoutableIPs)) {
          routable = h.RoutableIPs.filter(
            (x): x is string => typeof x === 'string',
          )
        }
        if (typeof h.OS === 'string') os = h.OS
        if (typeof h.IPNVersion === 'string') {
          clientVersion = h.IPNVersion.split('-')[0]
        }
      } catch {
        // If host_info cannot be parsed, treat it as having no additional information
      }
    }
    out.set(String(r.id), {
      lanIps: r.endpoints ? extractLanIps(r.endpoints, routable) : [],
      routableIps: routable,
      os,
      clientVersion,
    })
  }
  return out
}
