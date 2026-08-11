import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
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
import { ColumnFilter } from '@/components/column-filter'
import {
  columnCookieName,
  makeIsVisible,
  parseHidden,
  visibleCount,
  type ColumnDef,
} from '@/components/columns'
import { STICKY_ACTIONS } from '@/lib/table'
import { NodeRowActions } from './row-actions'

const PAGE = 'nodes'

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
  const [session, t, common, sp, cookieStore] = await Promise.all([
    requireSession(),
    getTranslations('nodes'),
    getTranslations('common'),
    searchParams,
    cookies(),
  ])
  const columns: ColumnDef[] = [
    { key: 'id', label: 'ID' },
    { key: 'alias', label: t('alias') },
    { key: 'ip', label: 'IP' },
    { key: 'lanIp', label: t('lanIp') },
    { key: 'user', label: t('user') },
    { key: 'online', label: common('online') },
    { key: 'approval', label: t('approval') },
    { key: 'note', label: t('note') },
    { key: 'tags', label: t('tags') },
    { key: 'lastSeen', label: t('lastSeen') },
    { key: 'actions', label: t('actions'), locked: true },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)
  const one = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v)?.trim() || ''
  }
  const q = one('q').toLowerCase()
  const status = one('status')

  const all = scopeNodes(session, await syncAndListNodes())
  // 局域网地址只能从 headscale 的库里读；非同机部署时返回空表，该列显示 —
  const netInfo = readNodeNetInfo()

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
      <ListFilters
        placeholder={t('searchPlaceholder')}
        columns={
          <ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />
        }
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
              {show('id') && <TableHead className="w-12">ID</TableHead>}
              {show('alias') && <TableHead>{t('alias')}</TableHead>}
              {show('ip') && <TableHead>IP</TableHead>}
              {show('lanIp') && <TableHead>{t('lanIp')}</TableHead>}
              {show('user') && <TableHead>{t('user')}</TableHead>}
              {show('online') && <TableHead>{common('online')}</TableHead>}
              {show('approval') && <TableHead>{t('approval')}</TableHead>}
              {show('note') && <TableHead>{t('note')}</TableHead>}
              {show('tags') && <TableHead>{t('tags')}</TableHead>}
              {show('lastSeen') && <TableHead>{t('lastSeen')}</TableHead>}
              {/* 表头留空：一列 ... 菜单不需要标题，省下的宽度给数据 */}
              <TableHead className={STICKY_ACTIONS} aria-label={t('actions')} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCount(columns, hidden)}
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
                    {show('id') && (
                      <TableCell className="text-muted-foreground">
                        {n.id}
                      </TableCell>
                    )}
                    {show('alias') && (
                      <TableCell className="font-medium">
                        {n.givenName}
                      </TableCell>
                    )}
                    {show('ip') && (
                      <TableCell className="font-mono text-xs">
                        {pickIpv4(n.ipAddresses) ?? '—'}
                      </TableCell>
                    )}
                    {show('lanIp') && (
                      <TableCell className="text-xs">
                        <LanIpCell ips={lanIps} />
                      </TableCell>
                    )}
                    {show('user') && (
                      <TableCell>{n.user?.name ?? '—'}</TableCell>
                    )}
                    {show('online') && (
                      <TableCell>
                        {n.online ? (
                          <Badge variant="success">{common('online')}</Badge>
                        ) : (
                          <Badge variant="secondary">{common('offline')}</Badge>
                        )}
                      </TableCell>
                    )}
                    {show('approval') && (
                      <TableCell>
                        <Badge variant={APPROVAL_VARIANT[n.status]}>
                          {t(n.status)}
                        </Badge>
                      </TableCell>
                    )}
                    {show('note') && (
                      <TableCell className="max-w-[14rem] truncate text-sm">
                        {n.note ? (
                          n.note
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {show('tags') && (
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
                    )}
                    {show('lastSeen') && (
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtTime(n.lastSeen)}
                      </TableCell>
                    )}
                    <TableCell className={STICKY_ACTIONS}>
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
