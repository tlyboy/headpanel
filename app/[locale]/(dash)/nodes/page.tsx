import { getTranslations } from 'next-intl/server'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { requireSession } from '@/lib/auth'
import { scopeNodes } from '@/lib/groups'
import { readNodeNetInfo } from '@/lib/headscale-db'
import { fmtTime, pickIpv4 } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LanIpCell } from '@/components/lan-ip-cell'
import { ListFilters } from '@/components/list-filters'
import { NodeRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

const APPROVAL_VARIANT: Record<
  'approved' | 'pending' | 'rejected',
  'success' | 'warning' | 'destructive'
> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
}

export default async function NodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, t, common, sp] = await Promise.all([
    requireSession(),
    getTranslations('nodes'),
    getTranslations('common'),
    searchParams,
  ])
  const one = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v)?.trim() || ''
  }
  const q = one('q').toLowerCase()
  const status = one('status')

  const all = scopeNodes(session, await syncAndListNodes())
  // 局域网地址只能从 headscale 的库里读；非同机部署时返回空表，该列显示 —
  const netInfo = readNodeNetInfo()

  // 计数按过滤前的全集算：筛选时也该看到这个 tailnet 一共多少台、多少在线
  let pending = 0
  let online = 0
  for (const node of all) {
    if (node.status === 'pending') pending += 1
    if (node.online) online += 1
  }

  // 搜索覆盖到局域网 IP：定位一台机器时，手边有的往往正是那个地址
  const nodes = all.filter((n) => {
    if (status === 'online' && !n.online) return false
    if (status === 'offline' && n.online) return false
    if (status && status !== 'online' && status !== 'offline') {
      if (n.status !== status) return false
    }
    if (!q) return true
    const hay = [
      n.givenName,
      n.user?.name ?? '',
      ...n.ipAddresses,
      ...(netInfo.get(n.id)?.lanIps ?? []),
      ...n.tags,
      n.note ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('summary', {
            total: nodes.length,
            online,
            pending,
          })}
        </p>
      </div>

      <ListFilters
        placeholder={t('searchPlaceholder')}
        clearLabel={t('clearFilters')}
        selects={[
          {
            name: 'status',
            placeholder: t('allStatus'),
            options: [
              { value: 'online', label: common('online') },
              { value: 'offline', label: common('offline') },
              { value: 'pending', label: t('pending') },
              { value: 'approved', label: t('approved') },
              { value: 'rejected', label: t('rejected') },
            ],
          },
        ]}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>{t('alias')}</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>{t('lanIp')}</TableHead>
              <TableHead>{t('user')}</TableHead>
              <TableHead>{common('online')}</TableHead>
              <TableHead>{t('approval')}</TableHead>
              <TableHead>{t('note')}</TableHead>
              <TableHead>{t('tags')}</TableHead>
              <TableHead>{t('lastSeen')}</TableHead>
              <TableHead className="w-12 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              nodes.map((n) => {
                // 首个是打分最高的（落在自己宣告网段内、非 .1 网关、非 docker 段）
                const lanIps = netInfo.get(n.id)?.lanIps ?? []
                return (
                  <TableRow key={n.id}>
                    <TableCell className="text-muted-foreground">
                      {n.id}
                    </TableCell>
                    <TableCell className="font-medium">{n.givenName}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {pickIpv4(n.ipAddresses) ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      <LanIpCell ips={lanIps} />
                    </TableCell>
                    <TableCell>{n.user?.name ?? '—'}</TableCell>
                    <TableCell>
                      {n.online ? (
                        <Badge variant="success">
                          {common('online')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{common('offline')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={APPROVAL_VARIANT[n.status]}>
                        {t(n.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-sm">
                      {n.note ? (
                        n.note
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {n.tags.length ? (
                        <span className="flex flex-wrap gap-1">
                          {n.tags.map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtTime(n.lastSeen)}
                    </TableCell>
                    <TableCell className="text-right">
                      <NodeRowActions
                        id={n.id}
                        name={n.givenName}
                        note={n.note ?? undefined}
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
