// headscale REST API client. Server-only; do not import from Client Components.

import 'server-only'

import { requiredEnv } from '@/lib/env'

// ---- Types (based on the JSON structure verified against headscale v0.28) ----
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
  key: string // Masked as hskey-auth-xxx-*** in list responses; returned in full on create
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
    cache: 'no-store', // The admin dashboard needs real-time data, and Next 16 does not cache fetch by default, but make sure explicitly here
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

// ---- Nodes ----
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
// Note: In headscale 0.28, the ?user= filter was verified to be completely ineffective; regardless of the user passed, it returns all keys.
// So this function only fetches all keys; filtering by group membership must be done by the caller at the application layer using key.user.id (the key's
// user field is accurate, unlike nodes, which get flattened to tagged-devices).
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

// ---- Users (= group namespaces) ----
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

// ---- Policy (ACL; requires headscale policy.mode: database; used in Phase 2) ----
export async function getPolicy(): Promise<{ policy: string; updatedAt: string }> {
  return hs<{ policy: string; updatedAt: string }>('/policy')
}

export async function setPolicy(policy: string): Promise<void> {
  await hs('/policy', { method: 'PUT', body: JSON.stringify({ policy }) })
}

export { HeadscaleError }
