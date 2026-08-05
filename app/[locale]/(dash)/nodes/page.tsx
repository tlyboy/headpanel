import { getTranslations } from 'next-intl/server'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { requireSession } from '@/lib/auth'
import { scopeNodes } from '@/lib/groups'
import { readNodeNetInfo } from '@/lib/headscale-db'
import { fmtTime } from '@/lib/format'
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
  // LAN addresses can only be read from the headscale database; for deployments on separate hosts, return an empty table, and display — in this column
  const netInfo = readNodeNetInfo()

  // Counts are based on the full set before filtering: even when filtering, you should still see how many devices this tailnet has in total and how many are online
  let pending = 0
  let online = 0
  for (const node of all) {
    if (node.status === 'pending') pending += 1
    if (node.online) online += 1
  }

  // Search includes LAN IPs: when locating a machine, the address you have on hand is often that one
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
                // The first one has the highest score (within a subnet it announced, not the .1 gateway, and not a docker range)
                const lanIps = netInfo.get(n.id)?.lanIps ?? []
                return (
                  <TableRow key={n.id}>
                    <TableCell className="text-muted-foreground">
                      {n.id}
                    </TableCell>
                    <TableCell className="font-medium">{n.givenName}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {n.ipAddresses.join(' / ')}
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
