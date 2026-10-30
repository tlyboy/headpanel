import 'server-only'

import { desc, eq, inArray } from 'drizzle-orm'
import { auditAfter, db } from '@/lib/db'
import { grants, type GrantRow } from '@/lib/db/schema'
import { listGroups } from '@/lib/groups'
import { listNodes, type HsNode } from '@/lib/headscale'
import { applyPolicy, type PolicyAcl, type PolicyGroup } from '@/lib/policy'

// Access grants punch one-way holes through group isolation: src may open connections to dst, and
// replies flow back automatically because tailscale filters are stateful. Groups stay isolated otherwise.
export type Endpoint =
  | { kind: 'zone' }
  | { kind: 'group'; groupId: number }
  | { kind: 'node'; nodeId: string }

export interface Grant {
  id: number
  src: Endpoint
  dst: Endpoint
  ports: string
  note: string | null
  createdAt: string
}

export type GrantRule = Pick<Grant, 'src' | 'dst' | 'ports'>

// The single parser for the stored (kind, ref) pair, used for both DB rows and client input.
export function parseEndpoint(kind: string, ref: string | null): Endpoint {
  if (kind === 'zone') return { kind: 'zone' }
  if (kind === 'group' && ref && /^[1-9]\d*$/.test(ref))
    return { kind: 'group', groupId: Number(ref) }
  if (kind === 'node' && ref && /^\d+$/.test(ref)) return { kind: 'node', nodeId: ref }
  throw new Error(`Invalid grant endpoint: ${kind}${ref == null ? '' : ` ${ref}`}`)
}

function endpointRef(e: Endpoint): string | null {
  if (e.kind === 'group') return String(e.groupId)
  if (e.kind === 'node') return e.nodeId
  return null
}

function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  return a.kind === b.kind && endpointRef(a) === endpointRef(b)
}

function toGrant(row: GrantRow): Grant {
  return {
    id: row.id,
    src: parseEndpoint(row.srcKind, row.srcRef),
    dst: parseEndpoint(row.dstKind, row.dstRef),
    ports: row.ports,
    note: row.note,
    createdAt: row.createdAt,
  }
}

export function listGrants(): Grant[] {
  return db.select().from(grants).orderBy(desc(grants.id)).all().map(toGrant)
}

export function grantsNeedNodes(rules: GrantRule[]): boolean {
  return rules.some((g) => g.src.kind === 'node' || g.dst.kind === 'node')
}

// Resolve each grant to headscale selectors. A grant whose group or node no longer exists emits no rule
// rather than failing the whole policy: one stale grant must not block every group operation.
// IPv6 stays bare in dst (`fd7a::1:22`); headscale 0.28 rejects the bracketed `[v6]:port` form.
export function compileGrants(
  rules: GrantRule[],
  rows: PolicyGroup[],
  nodes: Pick<HsNode, 'id' | 'ipAddresses'>[],
  zoneTag: string,
): PolicyAcl[] {
  const tagByGroup = new Map(rows.flatMap((r) => (r.id == null ? [] : [[r.id, r.okTag] as const])))
  const ipsByNode = new Map(nodes.map((n) => [n.id, n.ipAddresses]))
  const resolve = (e: Endpoint): string[] => {
    if (e.kind === 'zone') return [zoneTag]
    if (e.kind === 'group') {
      const tag = tagByGroup.get(e.groupId)
      return tag ? [tag] : []
    }
    return ipsByNode.get(e.nodeId) ?? []
  }
  return rules.flatMap((g) => {
    const src = resolve(g.src)
    const dst = resolve(g.dst)
    if (src.length === 0 || dst.length === 0) return []
    return [{ action: 'accept' as const, src, dst: dst.map((s) => `${s}:${g.ports}`) }]
  })
}

function normalizePorts(raw: string): string {
  const ports = raw.replace(/\s+/g, '')
  if (ports === '*') return ports
  const parts = ports.split(',')
  const valid = parts.every((p) => {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(p)
    if (!m) return false
    const lo = Number(m[1])
    const hi = m[2] == null ? lo : Number(m[2])
    return lo >= 1 && hi <= 65535 && lo <= hi
  })
  if (!ports || !valid) {
    throw new Error(
      'Ports must be * or a comma-separated list of ports or ranges (1-65535), e.g. 22,443,8000-8100',
    )
  }
  return ports
}

// Deploy the policy with the new grant first, then save it, same as createGroup: a rejected policy leaves nothing behind.
export async function createGrant(input: {
  src: Endpoint
  dst: Endpoint
  ports: string
  note: string
}): Promise<Grant> {
  const { src, dst } = input
  const ports = normalizePorts(input.ports)
  const note = input.note.trim() || null
  if (sameEndpoint(src, dst)) throw new Error('Source and destination must differ')

  const groupRows = listGroups()
  for (const e of [src, dst]) {
    if (e.kind === 'group' && !groupRows.some((g) => g.id === e.groupId)) {
      throw new Error('Group does not exist')
    }
  }
  if (src.kind === 'node' || dst.kind === 'node') {
    const nodes = await listNodes()
    for (const e of [src, dst]) {
      if (e.kind === 'node' && !nodes.some((n) => n.id === e.nodeId)) {
        throw new Error('Node does not exist')
      }
    }
  }

  await applyPolicy(groupRows, [...listGrants(), { src, dst, ports }])
  const row = db
    .insert(grants)
    .values({
      srcKind: src.kind,
      srcRef: endpointRef(src),
      dstKind: dst.kind,
      dstRef: endpointRef(dst),
      ports,
      note,
    })
    .returning()
    .get()
  return toGrant(row)
}

export async function deleteGrant(id: number): Promise<Grant> {
  const all = listGrants()
  const grant = all.find((g) => g.id === id)
  if (!grant) throw new Error('Grant does not exist')
  await applyPolicy(
    listGroups(),
    all.filter((g) => g.id !== id),
  )
  db.delete(grants).where(eq(grants.id, id)).run()
  return grant
}

// Node grants are compiled to IP literals, and headscale may hand a deleted node's IP to the next device
// that joins. So a grant must never outlive its node: callers drop it before (or as soon as they notice) the node is gone.
export async function dropNodeGrants(
  matches: (nodeId: string) => boolean,
  audit: { reason: string; actor?: string },
): Promise<void> {
  const all = listGrants()
  const hits = (e: Endpoint) => e.kind === 'node' && matches(e.nodeId)
  const dropped = all.filter((g) => hits(g.src) || hits(g.dst))
  if (dropped.length === 0) return
  await applyPolicy(
    listGroups(),
    all.filter((g) => !dropped.includes(g)),
  )
  db.delete(grants)
    .where(
      inArray(
        grants.id,
        dropped.map((g) => g.id),
      ),
    )
    .run()
  for (const g of dropped) {
    auditAfter('grant.delete', `#${g.id}`, `reason=${audit.reason}`, { actor: audit.actor ?? null })
  }
}
