import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { TriangleAlert } from 'lucide-react'
import { requireSuper } from '@/lib/auth'
import { pickIpv4 } from '@/lib/format'
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
import { ListFilters } from '@/components/list-filters'
import { ColumnFilter } from '@/components/column-filter'
import {
  columnCookieName,
  makeIsVisible,
  parseHidden,
  visibleCount,
  type ColumnDef,
} from '@/components/columns'
import { STICKY_ACTIONS } from '@/lib/table'
import { RouteRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

const PAGE = 'subnets'

// List the commands in the instructions one by one instead of lumping them into a single code block — each should be easy to copy and paste on its own
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
  /** The client is still advertising; after the advertisement is withdrawn, approved may still remain */
  available: boolean
  approved: boolean
  /** headscale actually routes traffic through it (when multiple nodes are on the same subnet, only one is primary) */
  serving: boolean
}

export default async function SubnetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // requireSuper: after switching to a group, this page will be blocked, just as it is for group admins
  const [, t, common, sp, cookieStore] = await Promise.all([
    requireSuper(),
    getTranslations('subnets'),
    getTranslations('common'),
    searchParams,
    cookies(),
  ])
  const rawQ = sp.q
  const q = ((Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? '').trim().toLowerCase()
  const nodes = await listNodes()
  // It's hard to tell which machine this route goes through from the node name and tailnet IP alone, so include the LAN address
  const netInfo = readNodeNetInfo()

  // Group by subnet: multiple nodes may advertise the same subnet, but only one of them carries traffic
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
  // Keep or filter the entire subnet together: keeping only the matching rows would make the grouping display for "multiple nodes on the same subnet" confusing
  const routes = [...byRoute.entries()]
    .filter(([route, list]) => {
      if (!q) return true
      const hay = [
        route,
        ...list.map((e) => e.node.givenName),
        ...list.flatMap((e) => netInfo.get(e.node.id)?.lanIps ?? []),
      ]
      return hay.join(' ').toLowerCase().includes(q)
    })
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  const columns: ColumnDef[] = [
    { key: 'route', label: t('route') },
    { key: 'node', label: t('node') },
    { key: 'lanIp', label: t('lanIp') },
    { key: 'status', label: t('status') },
    { key: 'advertising', label: t('advertising') },
    { key: 'actions', label: t('actions'), locked: true },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)

  return (
    <div className="flex flex-col gap-6">
      <ListFilters
        placeholder={t('searchPlaceholder')}
        columns={
          <ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {show('route') && <TableHead>{t('route')}</TableHead>}
              {show('node') && <TableHead>{t('node')}</TableHead>}
              {show('lanIp') && <TableHead>{t('lanIp')}</TableHead>}
              {show('status') && <TableHead>{t('status')}</TableHead>}
              {show('advertising') && <TableHead>{t('advertising')}</TableHead>}
              <TableHead className={STICKY_ACTIONS} aria-label={t('actions')} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCount(columns, hidden)}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              routes.flatMap(([route, list]) =>
                list.map((e, i) => (
                  <TableRow key={`${route}:${e.node.id}`}>
                    {show('route') && (
                      <TableCell className="font-mono text-xs">
                        {/* When multiple rows share a subnet, show the subnet only on the first row to visually group them */}
                        {i === 0 ? route : ''}
                      </TableCell>
                    )}
                    {show('node') && (
                      <TableCell className="text-sm">
                        {e.node.givenName}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {pickIpv4(e.node.ipAddresses) ?? '—'}
                        </span>
                      </TableCell>
                    )}
                    {show('lanIp') && (
                      <TableCell className="text-xs">
                        <LanIpCell ips={netInfo.get(e.node.id)?.lanIps ?? []} />
                      </TableCell>
                    )}
                    {show('status') && (
                      <TableCell>
                        {e.serving ? (
                          <Badge variant="success">{t('serving')}</Badge>
                        ) : e.approved ? (
                          <Badge variant="secondary">{t('standby')}</Badge>
                        ) : (
                          <Badge variant="warning">{t('pending')}</Badge>
                        )}
                      </TableCell>
                    )}
                    {show('advertising') && (
                      <TableCell>
                        {e.available ? (
                          common('yes')
                        ) : (
                          <span className="text-muted-foreground">
                            {common('no')}
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className={STICKY_ACTIONS}>
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
          <CardDescription>{t('howto.summary')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{t('howto.step1Title')}</h3>
              </div>
              {ADVERTISE_CMDS.map((c) => (
                <CmdBlock key={c.key} label={t(c.key)} cmd={c.cmd} />
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{t('howto.step2Title')}</h3>
                <p className="text-sm text-muted-foreground">
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
