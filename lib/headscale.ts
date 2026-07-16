// Headscale REST API client. Server-only; do not import from Client Components.

import 'server-only'

import { requiredEnv } from '@/lib/env'

const API_SUFFIX = '/api/v1'
const REQUEST_TIMEOUT_MS = 15_000

export interface HeadscaleConnectionInput {
  apiUrl: string
  apiKey: string
}

export interface HeadscaleConnection {
  apiUrl: string
  apiKey: string
  serverUrl: string
}

export interface HeadscaleVersion {
  version: string
  commit?: string
  buildTime?: string
  go?: {
    version?: string
    os?: string
    arch?: string
  }
  dirty?: boolean
}

// 类型覆盖 headscale v0.28/v0.29 当前使用到的公共字段。
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
  key: string // 仅 create 返回完整值；list 返回掩码
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
  user: HsUser | null
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
  tags: string[]
}

export class HeadscaleError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HeadscaleError'
  }
}

export function normalizeHeadscaleConnection(
  input: HeadscaleConnectionInput,
): HeadscaleConnection {
  const rawUrl = input.apiUrl.trim()
  const apiKey = input.apiKey.trim()
  if (!rawUrl) throw new Error('Headscale API URL is required')
  if (!apiKey) throw new Error('Headscale API key is required')

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Headscale API URL is invalid')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Headscale API URL must use http or https')
  }
  if (url.username || url.password) {
    throw new Error('Headscale API URL must not contain credentials')
  }

  url.hash = ''
  url.search = ''
  const basePath = url.pathname.replace(/\/+$/, '')
  const pathname = basePath.endsWith(API_SUFFIX)
    ? basePath
    : `${basePath}${API_SUFFIX}`
  url.pathname = pathname

  const apiUrl = url.toString().replace(/\/$/, '')
  url.pathname = pathname.slice(0, -API_SUFFIX.length) || '/'
  const serverUrl = url.toString().replace(/\/$/, '')
  return { apiUrl, apiKey, serverUrl }
}

// 当前自托管版本从环境变量读取；未来连接信息落库后，可直接为每个实例
// 调用 createHeadscaleClient({ apiUrl, apiKey })，无需改动业务方法。
export function getDefaultHeadscaleConnection(): HeadscaleConnection {
  const apiUrl = process.env.HEADSCALE_API_URL || process.env.HEADSCALE_URL
  if (!apiUrl) {
    throw new Error(
      'HEADSCALE_API_URL is required (HEADSCALE_URL is supported for compatibility)',
    )
  }
  return normalizeHeadscaleConnection({
    apiUrl,
    apiKey: requiredEnv('HEADSCALE_API_KEY'),
  })
}

export class HeadscaleClient {
  readonly connection: HeadscaleConnection

  constructor(input: HeadscaleConnectionInput) {
    this.connection = normalizeHeadscaleConnection(input)
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.connection.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.connection.apiKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      cache: 'no-store',
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new HeadscaleError(
        res.status,
        `headscale ${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body}`,
      )
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  async getVersion(): Promise<HeadscaleVersion> {
    const res = await fetch(`${this.connection.serverUrl}/version`, {
      headers: { Authorization: `Bearer ${this.connection.apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new HeadscaleError(
        res.status,
        `headscale GET /version -> ${res.status}`,
      )
    }
    return (await res.json()) as HeadscaleVersion
  }

  async listNodes(): Promise<HsNode[]> {
    const data = await this.request<{ nodes: HsNode[] }>('/node')
    return data.nodes ?? []
  }

  async getNode(id: string): Promise<HsNode> {
    const data = await this.request<{ node: HsNode }>(`/node/${id}`)
    return data.node
  }

  async renameNode(id: string, newName: string): Promise<void> {
    await this.request(`/node/${id}/rename/${encodeURIComponent(newName)}`, {
      method: 'POST',
    })
  }

  async expireNode(id: string): Promise<void> {
    await this.request(`/node/${id}/expire`, { method: 'POST' })
  }

  async deleteNode(id: string): Promise<void> {
    await this.request(`/node/${id}`, { method: 'DELETE' })
  }

  async setNodeTags(id: string, tags: string[]): Promise<void> {
    await this.request(`/node/${id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    })
  }

  async listPreAuthKeys(): Promise<HsPreAuthKey[]> {
    const data = await this.request<{ preAuthKeys: HsPreAuthKey[] }>(
      '/preauthkey',
    )
    return data.preAuthKeys ?? []
  }

  async createPreAuthKey(opts: {
    userId: string
    reusable: boolean
    ephemeral: boolean
    expiration: string
    aclTags: string[]
  }): Promise<HsPreAuthKey> {
    const data = await this.request<{ preAuthKey: HsPreAuthKey }>(
      '/preauthkey',
      {
        method: 'POST',
        body: JSON.stringify({
          user: opts.userId,
          reusable: opts.reusable,
          ephemeral: opts.ephemeral,
          expiration: opts.expiration,
          aclTags: opts.aclTags,
        }),
      },
    )
    return data.preAuthKey
  }

  async expirePreAuthKey(id: string): Promise<void> {
    await this.request('/preauthkey/expire', {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
  }

  async deletePreAuthKey(id: string): Promise<void> {
    await this.request(`/preauthkey?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  async listUsers(): Promise<HsUser[]> {
    const data = await this.request<{ users: HsUser[] }>('/user')
    return data.users ?? []
  }

  async createUser(name: string): Promise<HsUser> {
    const data = await this.request<{ user: HsUser }>('/user', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    return data.user
  }

  async deleteUser(id: string): Promise<void> {
    await this.request(`/user/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async getPolicy(): Promise<{ policy: string; updatedAt: string }> {
    return this.request<{ policy: string; updatedAt: string }>('/policy')
  }

  async setPolicy(policy: string): Promise<void> {
    await this.request('/policy', {
      method: 'PUT',
      body: JSON.stringify({ policy }),
    })
  }
}

export function createHeadscaleClient(
  input: HeadscaleConnectionInput,
): HeadscaleClient {
  return new HeadscaleClient(input)
}

function defaultClient(): HeadscaleClient {
  return new HeadscaleClient(getDefaultHeadscaleConnection())
}

export const getHeadscaleVersion = () => defaultClient().getVersion()
export const listNodes = () => defaultClient().listNodes()
export const getNode = (id: string) => defaultClient().getNode(id)
export const renameNode = (id: string, newName: string) =>
  defaultClient().renameNode(id, newName)
export const expireNode = (id: string) => defaultClient().expireNode(id)
export const deleteNode = (id: string) => defaultClient().deleteNode(id)
export const setNodeTags = (id: string, tags: string[]) =>
  defaultClient().setNodeTags(id, tags)
export const listPreAuthKeys = () => defaultClient().listPreAuthKeys()
export const createPreAuthKey = (
  opts: Parameters<HeadscaleClient['createPreAuthKey']>[0],
) => defaultClient().createPreAuthKey(opts)
export const expirePreAuthKey = (id: string) =>
  defaultClient().expirePreAuthKey(id)
export const deletePreAuthKey = (id: string) =>
  defaultClient().deletePreAuthKey(id)
export const listUsers = () => defaultClient().listUsers()
export const createHsUser = (name: string) => defaultClient().createUser(name)
export const deleteHsUser = (id: string) => defaultClient().deleteUser(id)
export const getPolicy = () => defaultClient().getPolicy()
export const setPolicy = (policy: string) => defaultClient().setPolicy(policy)
