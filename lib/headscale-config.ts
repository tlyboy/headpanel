import 'server-only'

import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { requiredEnv } from '@/lib/env'

const pexec = promisify(execFile)

export interface HeadscaleNetworkConfig {
  configPath: string
  ipv4Prefix: string
  ipv6Prefix: string | null
  allocation: string | null
}

export interface UpdateNetworkResult {
  backupPath: string
}

const HOST_CONTROL_ENV = 'HEADSCALE_HOST_CONTROL'
const HOST_CONTROL_PATHS = [
  'HEADSCALE_CONFIG_PATH',
  'HEADSCALE_BIN',
  'SYSTEMCTL_BIN',
] as const

// API-only 部署无需主机权限。旧部署未设置开关时，如果三个本机路径都存在于
// 环境变量中则保持原行为；纯控制平面只配置 API URL/key 时会自动关闭。
export function isHeadscaleHostControlEnabled(): boolean {
  const explicit = process.env[HOST_CONTROL_ENV]?.trim().toLowerCase()
  if (explicit) {
    if (['1', 'true', 'yes', 'on'].includes(explicit)) return true
    if (['0', 'false', 'no', 'off'].includes(explicit)) return false
    throw new Error(`${HOST_CONTROL_ENV} must be true or false`)
  }
  return HOST_CONTROL_PATHS.every((name) => Boolean(process.env[name]))
}

export function requireHeadscaleHostControl(): void {
  if (!isHeadscaleHostControlEnabled()) {
    throw new Error(
      'Headscale host control is disabled; this operation requires local config and service access',
    )
  }
}

function parseIpv4(ip: string): number {
  const parts = ip.split('.')
  if (parts.length !== 4) throw new Error('Invalid IPv4 address format')
  let n = 0
  for (const p of parts) {
    if (!/^\d+$/.test(p)) throw new Error('Invalid IPv4 address format')
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error('Each IPv4 octet must be between 0 and 255')
    }
    n = (n << 8) | v
  }
  return n >>> 0
}

function mask(prefixLen: number): number {
  if (prefixLen === 0) return 0
  return (0xffffffff << (32 - prefixLen)) >>> 0
}

function formatIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(
    '.',
  )
}

export function validateTailscaleIpv4Prefix(cidr: string): string {
  const value = cidr.trim()
  const m = value.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/)
  if (!m) throw new Error('Enter an IPv4 CIDR, for example 100.64.0.0/24')

  const ip = parseIpv4(m[1])
  const prefixLen = Number(m[2])
  if (!Number.isInteger(prefixLen) || prefixLen < 10 || prefixLen > 32) {
    throw new Error('Prefix length must be between /10 and /32')
  }

  const networkMask = mask(prefixLen)
  const network = ip & networkMask
  if (network !== ip) {
    throw new Error(
      `CIDR must use the network address. Try ${formatIpv4(network)}/${prefixLen}`,
    )
  }

  const tailscaleBase = parseIpv4('100.64.0.0')
  const tailscaleMask = mask(10)
  if ((network & tailscaleMask) !== tailscaleBase) {
    throw new Error(
      'IPv4 prefix must be inside the Tailscale 100.64.0.0/10 range',
    )
  }

  return `${formatIpv4(network)}/${prefixLen}`
}

function parsePrefixes(
  config: string,
): Omit<HeadscaleNetworkConfig, 'configPath'> {
  const block = config.match(/^prefixes:\n((?:^[ \t]+.*\n?)*)/m)
  if (!block?.[1]) throw new Error('Could not find the prefixes config block')

  const body = block[1]
  const v4 = body.match(/^[ \t]+v4:[ \t]*([^#\n]+).*$/m)?.[1]?.trim()
  if (!v4) throw new Error('Could not find prefixes.v4 in the config')

  return {
    ipv4Prefix: v4,
    ipv6Prefix:
      body.match(/^[ \t]+v6:[ \t]*([^#\n]+).*$/m)?.[1]?.trim() ?? null,
    allocation:
      body.match(/^[ \t]+allocation:[ \t]*([^#\n]+).*$/m)?.[1]?.trim() ?? null,
  }
}

function replaceIpv4Prefix(config: string, ipv4Prefix: string): string {
  const prefixes = /^prefixes:\n((?:^[ \t]+.*\n?)*)/m.exec(config)
  if (!prefixes?.[1] || prefixes.index == null) {
    throw new Error('Could not find the prefixes config block')
  }

  const block = prefixes[0]
  if (!/^[ \t]+v4:[ \t]*[^#\n]+.*$/m.test(block)) {
    throw new Error('Could not find prefixes.v4 in the config')
  }

  const nextBlock = block.replace(
    /^([ \t]+v4:[ \t]*)([^#\n]+)(.*)$/m,
    (_line, head: string, _old: string, tail: string) =>
      `${head}${ipv4Prefix}${tail}`,
  )
  return `${config.slice(0, prefixes.index)}${nextBlock}${config.slice(
    prefixes.index + block.length,
  )}`
}

async function runCommand(bin: string, args: string[]): Promise<void> {
  try {
    await pexec(bin, args, { timeout: 20000 })
  } catch (e) {
    const err = e as { code?: string; stderr?: string; message?: string }
    if (err.code === 'ENOENT') {
      throw new Error(`${bin} is not available`)
    }
    throw new Error(err.stderr?.trim() || err.message || `${bin} failed`)
  }
}

export async function readHeadscaleNetworkConfig(): Promise<HeadscaleNetworkConfig> {
  requireHeadscaleHostControl()
  const configPath = requiredEnv('HEADSCALE_CONFIG_PATH')
  const config = await readFile(/* turbopackIgnore: true */ configPath, 'utf8')
  return { configPath, ...parsePrefixes(config) }
}

export async function updateHeadscaleIpv4Prefix(
  nextPrefix: string,
): Promise<UpdateNetworkResult> {
  requireHeadscaleHostControl()
  const configPath = requiredEnv('HEADSCALE_CONFIG_PATH')
  const ipv4Prefix = validateTailscaleIpv4Prefix(nextPrefix)
  const current = await readFile(/* turbopackIgnore: true */ configPath, 'utf8')
  const old = parsePrefixes(current).ipv4Prefix
  if (old === ipv4Prefix)
    throw new Error('The new prefix is the same as the current prefix')

  const next = replaceIpv4Prefix(current, ipv4Prefix)
  const tempDir = await mkdtemp(join(tmpdir(), 'headscale-config-'))
  const tempPath = join(tempDir, 'config.yaml')

  try {
    await writeFile(tempPath, next, 'utf8')
    await runCommand(requiredEnv('HEADSCALE_BIN'), [
      'configtest',
      '-c',
      tempPath,
    ])

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${configPath}.bak-prefix-${stamp}`
    await copyFile(/* turbopackIgnore: true */ configPath, backupPath)
    await writeFile(/* turbopackIgnore: true */ configPath, next, 'utf8')
    await runCommand(requiredEnv('HEADSCALE_BIN'), [
      'configtest',
      '-c',
      configPath,
    ])
    await runCommand(requiredEnv('SYSTEMCTL_BIN'), ['restart', 'headscale'])
    return { backupPath }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
