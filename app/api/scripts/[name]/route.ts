import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

// 公开端点（无鉴权）：脚本本身不含任何密钥，authkey 是用户运行时
// 传入的参数。公开是为了支持 `curl ... | bash` / `iwr ... | iex` 一键安装。
// 安全靠：白名单 + basename 防路径穿越。

// 白名单：只允许下载 scripts/ 下这些固定文件
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
  const safe = basename(name) // 防路径穿越

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
