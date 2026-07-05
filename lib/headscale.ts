// headscale REST API client. Server-only; do not import from Client Components.

import 'server-only'

import { requiredEnv } from '@/lib/env'

// ---- 类型（按 headscale v0.28 实测 JSON 结构）----
export interface HsUser {
  id: string
  name: string
  createdAt: string
  displayName: string
  email: string
}

export interface HsPreAuthKey {
  user: HsUser
  id: string
  key: string // list 时被 mask 成 hskey-auth-xxx-***；create 时返回完整
  reusable: boolean
  ephemeral: boolean
  used: boolean
  expiration: string
  createdAt: string
  aclTags: string[]
}

export interface HsNode {
  id: string
  machineKey: string
  nodeKey: string
  discoKey: string
  ipAddresses: string[]
  name: string
  user: HsUser
  lastSeen: string
  expiry: string
  preAuthKey: HsPreAuthKey | null
  createdAt: string
  registerMethod: string
  givenName: string
  online: boolean
  approvedRoutes: string[]
  availableRoutes: string[]
  subnetRoutes: string[]
  tags: string[] // forced tags
}

class HeadscaleError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HeadscaleError'
  }
}

async function hs<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${requiredEnv('HEADSCALE_URL')}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requiredEnv('HEADSCALE_API_KEY')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store', // 管理后台要实时数据，Next 16 fetch 默认也不缓存，这里显式确保
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HeadscaleError(
      res.status,
      `headscale ${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body}`,
    )
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- 节点 ----
export async function listNodes(): Promise<HsNode[]> {
  const d = await hs<{ nodes: HsNode[] }>('/node')
  return d.nodes ?? []
}

export async function getNode(id: string): Promise<HsNode> {
  const d = await hs<{ node: HsNode }>(`/node/${id}`)
  return d.node
}

export async function renameNode(id: string, newName: string): Promise<void> {
  await hs(`/node/${id}/rename/${encodeURIComponent(newName)}`, { method: 'POST' })
}

export async function expireNode(id: string): Promise<void> {
  await hs(`/node/${id}/expire`, { method: 'POST' })
}

export async function deleteNode(id: string): Promise<void> {
  await hs(`/node/${id}`, { method: 'DELETE' })
}

export async function setNodeTags(id: string, tags: string[]): Promise<void> {
  await hs(`/node/${id}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tags }),
  })
}

// ---- preauthkey ----
// 注意：headscale 0.28 的 ?user= 过滤【实测完全失效】，无论传什么 user 都返回全部 key。
// 故这里只负责拉全部，按组归属的过滤一律由调用方用 key.user.id 在应用层做（key 的
// user 字段是真实的，不像 node 会被抹成 tagged-devices）。
export async function listPreAuthKeys(userId: string): Promise<HsPreAuthKey[]> {
  const d = await hs<{ preAuthKeys: HsPreAuthKey[] }>(
    `/preauthkey?user=${encodeURIComponent(userId)}`,
  )
  return d.preAuthKeys ?? []
}

export async function createPreAuthKey(opts: {
  userId: string
  reusable: boolean
  ephemeral: boolean
  expiration: string // RFC3339
  aclTags: string[]
}): Promise<HsPreAuthKey> {
  const d = await hs<{ preAuthKey: HsPreAuthKey }>('/preauthkey', {
    method: 'POST',
    body: JSON.stringify({
      user: opts.userId,
      reusable: opts.reusable,
      ephemeral: opts.ephemeral,
      expiration: opts.expiration,
      aclTags: opts.aclTags,
    }),
  })
  return d.preAuthKey
}

export async function expirePreAuthKey(
  key: string,
  userId: string,
): Promise<void> {
  await hs('/preauthkey/expire', {
    method: 'POST',
    body: JSON.stringify({ user: userId, key }),
  })
}

// ---- 用户（= 组的 namespace）----
export async function listUsers(): Promise<HsUser[]> {
  const d = await hs<{ users: HsUser[] }>('/user')
  return d.users ?? []
}

export async function createHsUser(name: string): Promise<HsUser> {
  const d = await hs<{ user: HsUser }>('/user', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return d.user
}

export async function deleteHsUser(id: string): Promise<void> {
  await hs(`/user/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---- 策略（ACL，需 headscale policy.mode: database，Phase 2 用）----
export async function getPolicy(): Promise<{ policy: string; updatedAt: string }> {
  return hs<{ policy: string; updatedAt: string }>('/policy')
}

export async function setPolicy(policy: string): Promise<void> {
  await hs('/policy', { method: 'PUT', body: JSON.stringify({ policy }) })
}

export { HeadscaleError }
