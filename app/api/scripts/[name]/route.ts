import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

// Public endpoint (no authentication): the scripts contain no secrets; authkey is an argument
// passed in by the user at runtime. The endpoint is public to support one-click installation via `curl ... | bash` / `iwr ... | iex`.
// Security relies on: an allowlist + basename to prevent path traversal.

// Allowlist: only allow downloads of these fixed files under scripts/
export const SCRIPT_FILES = [
  'install-tailscale.sh',
  'install-tailscale.ps1',
  'deploy-tailscale-linux.sh',
  'uninstall-tailscale.sh',
  'uninstall-tailscale.ps1',
  'uninstall-zerotier.sh',
  'uninstall-zerotier.ps1',
] as const

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const safe = basename(name) // Prevent path traversal

  if (!SCRIPT_FILES.includes(safe as (typeof SCRIPT_FILES)[number])) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const content = await readFile(join(process.cwd(), 'scripts', safe), 'utf8')
    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safe}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
