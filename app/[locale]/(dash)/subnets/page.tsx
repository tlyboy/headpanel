import { getTranslations } from 'next-intl/server'
import { TriangleAlert } from 'lucide-react'
import { requireSuper } from '@/lib/auth'
import { readNodeNetInfo } from '@/lib/headscale-db'
import { listNodes, type HsNode } from '@/lib/headscale'
import { LanIpCell } from '@/components/lan-ip-cell'
import { CmdBlock } from '@/components/cmd-block'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

// 说明里的命令逐条给出而不是堆成一个代码块——每条都要能单独复制粘贴
const ADVERTISE_CMDS = [
  {
    key: 'howto.cmdAdvertiseLinux',
    cmd: 'sudo tailscale up --advertise-routes=192.168.1.0/24',
  },
  {
    key: 'howto.cmdAdvertiseWindows',
    cmd: 'tailscale set --advertise-routes=192.168.1.0/24',
  },
  { key: 'howto.cmdAdvertiseStop', cmd: 'tailscale set --advertise-routes=' },
] as const

const FORWARD_CMDS = [
  {
    key: 'howto.cmdForwardLinux',
    cmd: "echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-tailscale.conf\nsudo sysctl -p /etc/sysctl.d/99-tailscale.conf",
  },
  {
    key: 'howto.cmdForwardWindows',
    cmd: "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters' -Name 'IPEnableRouter' -Value 1 -Type DWord\nRestart-Computer",
  },
] as const

interface RouteEntry {
  node: HsNode
  /** 客户端侧仍在宣告；撤销宣告后 approved 可能还留着 */
  available: boolean
  approved: boolean
  /** headscale 实际把流量交给它（同网段多节点时只有一个 primary） */
  serving: boolean
}

export default async function SubnetsPage() {
  // requireSuper：切进某个组后这页会被挡在外面，和组管理员看到的一致
  const [, t, common] = await Promise.all([
    requireSuper(),
    getTranslations('subnets'),
    getTranslations('common'),
  ])
  const nodes = await listNodes()
  // 光看节点名和 tailnet IP 不好判断这条路由是哪台机器出去的，补上局域网地址
  const netInfo = readNodeNetInfo()

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
              <TableHead>{t('lanIp')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('advertising')}</TableHead>
              <TableHead className="w-24 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
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
                    <TableCell className="text-xs">
                      <LanIpCell ips={netInfo.get(e.node.id)?.lanIps ?? []} />
                    </TableCell>
                    <TableCell>
                      {e.serving ? (
                        <Badge variant="success">
                          {t('serving')}
                        </Badge>
                      ) : e.approved ? (
                        <Badge variant="secondary">{t('standby')}</Badge>
                      ) : (
                        <Badge variant="warning">
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

      <Card>
        <CardHeader>
          <CardTitle>{t('howto.title')}</CardTitle>
          <CardDescription>{t('howto.intro')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{t('howto.step1Title')}</h3>
                <p className="text-muted-foreground text-sm">
                  {t('howto.step1Desc')}
                </p>
              </div>
              {ADVERTISE_CMDS.map((c) => (
                <CmdBlock key={c.key} label={t(c.key)} cmd={c.cmd} />
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{t('howto.step2Title')}</h3>
                <p className="text-muted-foreground text-sm">
                  {t('howto.step2Desc')}
                </p>
              </div>
              {FORWARD_CMDS.map((c) => (
                <CmdBlock key={c.key} label={t(c.key)} cmd={c.cmd} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">{t('howto.step3Title')}</span>{' '}
              <span className="text-muted-foreground">
                {t('howto.step3Desc')}
              </span>
            </p>
            <p>
              <span className="font-medium">{t('howto.accessTitle')}</span>{' '}
              <span className="text-muted-foreground">
                {t('howto.accessDesc')}
              </span>
            </p>
          </div>

          <Alert>
            <TriangleAlert />
            <AlertTitle>{t('howto.warnTitle')}</AlertTitle>
            <AlertDescription>{t('howto.warnDesc')}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
