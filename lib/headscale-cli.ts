import 'server-only'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requiredEnv } from '@/lib/env'

const pexec = promisify(execFile)

interface ExecErr {
  code?: string
  stderr?: string
  message?: string
}

export async function headscaleCli(args: string[]): Promise<string> {
  const bin = requiredEnv('HEADSCALE_BIN')
  try {
    const { stdout } = await pexec(bin, args, { timeout: 15000 })
    return stdout
  } catch (e) {
    const err = e as ExecErr
    console.error(
      `[headscaleCli] bin=${bin} args=${JSON.stringify(args)} code=${err.code} stderr=${err.stderr} msg=${err.message}`,
    )
    if (err.code === 'ENOENT') {
      throw new Error(`headscale CLI is not available at ${bin}`)
    }
    throw new Error(err.stderr || err.message || 'headscale CLI failed')
  }
}
