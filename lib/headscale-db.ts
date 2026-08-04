import 'server-only'

import { existsSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

// headscale 的 REST API 不返回节点的 endpoints / host_info（只有 tailnet IP 和
// 路由字段），要拿到节点在自己局域网里的地址，只能直接读它的 SQLite。
// 代价：仅在面板与 headscale 同机时可用，且依赖 headscale 的表结构——
// 因此这里全程降级处理，读不到就当没有，绝不阻断页面。

const DEFAULT_DB_PATH = '/var/lib/headscale/db.sqlite'

export interface NodeNetInfo {
  /** 局域网地址，最像「这台机器在局域网里的地址」的排在最前 */
  lanIps: string[]
  /** 客户端侧宣告的网段（host_info.RoutableIPs），未必已被批准 */
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
      // 与 headscale-config.ts 一致：正则挖 yaml，不引解析库
      const block = cfg.match(/^database:\n((?:^[ \t]+.*\n?)*)/m)?.[1]
      const p = block?.match(/^[ \t]+path:[ \t]*([^#\n]+).*$/m)?.[1]?.trim()
      if (p) return p
    } catch {
      // 落到默认路径
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

// 私有网段。刻意排除 100.64/10（那是 tailnet 自身地址）与 198.18/15
// （Surge 等用户态实现的 fake-ip，不是真实局域网）。
function isPrivateLan(ip: number): boolean {
  return (
    inCidr(ip, '10.0.0.0/8') ||
    inCidr(ip, '172.16.0.0/12') ||
    inCidr(ip, '192.168.0.0/16')
  )
}

// endpoints 里混着三类地址：公网出口、真实局域网 IP、以及 docker/WSL/VMware
// 之类虚拟网卡的地址；此外 STUN 有时会把网关地址也报进来（如 192.168.120.1）。
// headscale 不区分它们，只能按特征打分，把最可能是「这台机器局域网地址」的排前面。
function scoreLanIp(ip: string, routable: string[]): number {
  const n = parseIpv4(ip)
  if (n == null) return -Infinity
  let score = 0
  // 落在自己宣告的网段内 —— 它作为 subnet router 的那块网卡，最可信
  if (routable.some((r) => inCidr(n, r))) score += 100
  // 以 .1 结尾的多半是网关或虚拟网桥（VMware/Hyper-V 惯用 x.x.x.1），
  // STUN 报上来的网关映射也长这样
  if (!ip.endsWith('.1')) score += 50
  // docker / WSL 惯用 172.16/12
  if (inCidr(n, '172.16.0.0/12')) score -= 30
  // 家用/办公网段最常见
  if (inCidr(n, '192.168.0.0/16')) score += 10
  return score
}

/** 从 endpoint 串（"1.2.3.4:41641" 或 "[v6]:41641"）里取出 IPv4，取不到返回 null */
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
    // 表结构随 headscale 版本变动，缺列就整体放弃而不是半路抛错
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
 * 读各节点的局域网地址与客户端宣告的网段，key 为 headscale node id（字符串，
 * 与 REST API 的 node.id 对齐）。读不到时返回空 Map —— 调用方按「没有这项信息」
 * 渲染即可，不必区分是未部署在同机还是 headscale 换了表结构。
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
        // host_info 解析不了就只当没有附加信息
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
