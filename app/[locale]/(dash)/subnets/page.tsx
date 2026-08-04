import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { listNodes, type HsNode } from '@/lib/headscale'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RouteRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

interface RouteEntry {
  node: HsNode
  /** 客户端侧仍在宣告；撤销宣告后 approved 可能还留着 */
  available: boolean
  approved: boolean
  /** headscale 实际把流量交给它（同网段多节点时只有一个 primary） */
  serving: boolean
}

export default async function SubnetsPage() {
  const [, t, common] = await Promise.all([
    requireSuper(),
    getTranslations('subnets'),
    getTranslations('common'),
  ])
  const nodes = await listNodes()

  // 按网段聚合：同一网段可能有多个节点宣告，其中只有一个在承载
  const byRoute = new Map<string, RouteEntry[]>()
  for (const n of nodes) {
    const routes = new Set([
      ...(n.availableRoutes ?? []),
      ...(n.approvedRoutes ?? []),
    ])
    for (const r of routes) {
      const list = byRoute.get(r) ?? []
      list.push({
        node: n,
        available: (n.availableRoutes ?? []).includes(r),
        approved: (n.approvedRoutes ?? []).includes(r),
        serving: (n.subnetRoutes ?? []).includes(r),
      })
      byRoute.set(r, list)
    }
  }
  const routes = [...byRoute.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const servingCount = routes.filter(([, list]) =>
    list.some((e) => e.serving),
  ).length
  const pendingCount = routes.reduce(
    (acc, [, list]) => acc + list.filter((e) => !e.approved).length,
    0,
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('summary', {
            total: routes.length,
            serving: servingCount,
            pending: pendingCount,
          })}
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('route')}</TableHead>
              <TableHead>{t('node')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('advertising')}</TableHead>
              <TableHead className="w-24 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              routes.flatMap(([route, list]) =>
                list.map((e, i) => (
                  <TableRow key={`${route}:${e.node.id}`}>
                    <TableCell className="font-mono text-xs">
                      {/* 同网段多行时只在第一行显示网段，视觉上归组 */}
                      {i === 0 ? route : ''}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.node.givenName}
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        {e.node.ipAddresses[0]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {e.serving ? (
                        <Badge className="bg-emerald-600 text-white">
                          {t('serving')}
                        </Badge>
                      ) : e.approved ? (
                        <Badge variant="secondary">{t('standby')}</Badge>
                      ) : (
                        <Badge className="bg-amber-600 text-white">
                          {t('pending')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {e.available ? (
                        common('yes')
                      ) : (
                        <span
                          className="text-muted-foreground"
                          title={t('staleHint')}
                        >
                          {common('no')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RouteRowActions
                        nodeId={e.node.id}
                        nodeName={e.node.givenName}
                        route={route}
                        approved={e.approved}
                        isPrimary={e.serving}
                      />
                    </TableCell>
                  </TableRow>
                )),
              )
            )}
          </TableBody>
        </Table>
      </div>

      <section className="rounded-md border p-4">
        <h2 className="font-medium">{t('howto.title')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('howto.intro')}
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">{t('howto.step1Title')}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('howto.step1Desc')}
            </p>
            <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-xs">
              <code>{`# Linux / macOS
tailscale up --advertise-routes=192.168.1.0/24 --accept-dns=false

# Windows（PowerShell，管理员）
tailscale set --advertise-routes=192.168.1.0/24

# 取消宣告（三个平台通用）
tailscale set --advertise-routes=`}</code>
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium">{t('howto.step2Title')}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('howto.step2Desc')}
            </p>
            <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-xs">
              <code>{`# Linux：开启内核转发
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf

# Windows：开启后必须重启才生效
Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters' \`
                 -Name 'IPEnableRouter' -Value 1 -Type DWord
Restart-Computer`}</code>
            </pre>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-medium">{t('howto.step3Title')}</span>{' '}
            <span className="text-muted-foreground">{t('howto.step3Desc')}</span>
          </p>
          <p>
            <span className="font-medium">{t('howto.accessTitle')}</span>{' '}
            <span className="text-muted-foreground">
              {t('howto.accessDesc')}
            </span>
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-amber-600">
              {t('howto.warnTitle')}
            </span>{' '}
            {t('howto.warnDesc')}
          </p>
        </div>
      </section>
    </div>
  )
}
