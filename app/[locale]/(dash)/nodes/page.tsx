import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { requireSession } from '@/lib/auth'
import { declaredTags } from '@/lib/policy'
import { readNodeNetInfo } from '@/lib/headscale-db'
import { fmtTime, pickIpv4, tagLabel } from '@/lib/format'
import { approvedTag } from '@/lib/default-zone'
import { ListFilters } from '@/components/list-filters'
import { ColumnFilter } from '@/components/column-filter'
import {
  columnCookieName,
  makeIsVisible,
  resolveHidden,
  visibleCount,
  type ColumnDef,
} from '@/components/columns'
import { LocationCell } from './location-cell'
import { PendingCard } from './pending-card'
import { NodeSelection, RowSelect, SelectAll, TagCell } from './selection'
import { NodeRowActions } from './row-actions'
import { OsIcon, osLabel } from '@/components/os-icon'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableHead } from '@/components/ui/table'
import { LanIpCell } from '@/components/lan-ip-cell'
import { VirtualTable } from '@/components/virtual-table'
import { STICKY_ACTIONS } from '@/lib/table'

const PAGE = 'nodes'
/** Mirrors the header widths below. The rest is the checkbox, the actions and a usable note column. */
const COLUMN_REM: Record<string, number> = {
  id: 3,
  alias: 11,
  system: 6,
  location: 7,
  ip: 8,
  lanIp: 10,
  online: 5,
  tags: 12,
  lastSeen: 11,
}
const FIXED_REM = 2.5 + 3.25 + 10

function minWidthRem(show: (key: string) => boolean) {
  return Object.entries(COLUMN_REM).reduce(
    (sum, [key, rem]) => (show(key) ? sum + rem : sum),
    FIXED_REM,
  )
}

function SystemCell({ os }: { os: string | null | undefined }) {
  if (!os) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <OsIcon os={os} className="size-3.5 shrink-0" />
      <span className="truncate">{osLabel(os)}</span>
    </span>
  )
}

export default async function NodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [, t, common, sp, cookieStore] = await Promise.all([
    requireSession(),
    getTranslations('nodes'),
    getTranslations('common'),
    searchParams,
    cookies(),
  ])
  const columns: ColumnDef[] = [
    { key: 'id', label: 'ID', defaultHidden: true },
    { key: 'alias', label: t('alias') },
    { key: 'system', label: t('system') },
    { key: 'location', label: t('location') },
    { key: 'ip', label: 'IP' },
    { key: 'lanIp', label: t('lanIp') },
    { key: 'online', label: common('online') },
    { key: 'note', label: t('note') },
    { key: 'tags', label: t('tags') },
    { key: 'lastSeen', label: t('lastSeen'), defaultHidden: true },
    { key: 'actions', label: t('actions'), locked: true },
  ]
  const hidden = resolveHidden(columns, cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)
  const one = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v)?.trim() || ''
  }
  const q = one('q').toLowerCase()
  const status = one('status')
  const tagFilter = one('tag')
  const locationFilter = one('location')
  const systemFilter = one('system')

  const all = await syncAndListNodes()
  // LAN addresses can only be read from the headscale database; for deployments on separate hosts, return an empty table, and display — in this column
  const netInfo = readNodeNetInfo()
  const tagOptions = declaredTags()
  const sortedUnique = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b))
  const locationOptions = sortedUnique(all.map((n) => n.location))
  const systemOptions = sortedUnique(all.map((n) => netInfo.get(n.id)?.os))

  // Pending nodes get their own card above the list; rejected ones are deleted from headscale.
  const pending = all.filter((n) => n.status === 'pending')
  // Search includes LAN IPs: when locating a machine, the address you have on hand is often that one
  const nodes = all.filter((n) => {
    if (n.status === 'pending') return false
    if (status === 'online' && !n.online) return false
    if (status === 'offline' && n.online) return false
    if (tagFilter && !n.tags.includes(tagFilter)) return false
    if (locationFilter && n.location !== locationFilter) return false
    if (systemFilter && netInfo.get(n.id)?.os !== systemFilter) return false
    if (!q) return true
    const hay = [
      n.givenName,
      ...n.ipAddresses,
      ...(netInfo.get(n.id)?.lanIps ?? []),
      ...n.tags,
      n.note ?? '',
      n.location ?? '',
      netInfo.get(n.id)?.os ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <PendingCard
          nodes={pending.map((n) => ({
            id: n.id,
            name: n.givenName,
            ip: pickIpv4(n.ipAddresses) ?? '—',
            createdAt: n.createdAt,
          }))}
          tagOptions={tagOptions}
          defaultTag={approvedTag()}
        />
      )}
      <ListFilters
        placeholder={t('searchPlaceholder')}
        columns={<ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />}
        selects={[
          {
            name: 'status',
            placeholder: t('allStatus'),
            options: [
              { value: 'online', label: common('online') },
              { value: 'offline', label: common('offline') },
            ],
          },
          {
            name: 'tag',
            placeholder: t('allTags'),
            options: tagOptions.map((tag) => ({ value: tag, label: tagLabel(tag) })),
          },
          {
            name: 'location',
            placeholder: t('allLocations'),
            options: locationOptions.map((value) => ({ value, label: value })),
          },
          {
            name: 'system',
            placeholder: t('allSystems'),
            options: systemOptions.map((value) => ({ value, label: osLabel(value) })),
          },
        ]}
      />

      <NodeSelection
        tagsById={Object.fromEntries(nodes.map((n) => [n.id, n.tags]))}
        tagCounts={Object.fromEntries(
          tagOptions.map((tag) => [tag, all.filter((n) => n.tags.includes(tag)).length]),
        )}
        defaultTag={approvedTag()}
      >
        <VirtualTable
          minWidth={`${minWidthRem(show)}rem`}
          colSpan={visibleCount(columns, hidden) + 1}
          empty={t('empty')}
          head={
            <>
              <TableHead className="w-10">
                <SelectAll />
              </TableHead>
              {show('id') && <TableHead className="w-12">ID</TableHead>}
              {show('alias') && <TableHead className="w-44">{t('alias')}</TableHead>}
              {show('system') && <TableHead className="w-24">{t('system')}</TableHead>}
              {show('location') && <TableHead className="w-28">{t('location')}</TableHead>}
              {show('ip') && <TableHead className="w-32">IP</TableHead>}
              {show('lanIp') && <TableHead className="w-40">{t('lanIp')}</TableHead>}
              {show('online') && <TableHead className="w-20">{common('online')}</TableHead>}
              {show('note') && <TableHead>{t('note')}</TableHead>}
              {show('tags') && <TableHead className="w-48">{t('tags')}</TableHead>}
              {show('lastSeen') && <TableHead className="w-44">{t('lastSeen')}</TableHead>}
              {/* Leave the header blank: a column of ... menus needs no title, and the saved width goes to the data */}
              <TableHead className={STICKY_ACTIONS} aria-label={t('actions')} />
            </>
          }
          rows={nodes.map((n) => ({
            key: n.id,
            cells: (
              <>
                <TableCell>
                  <RowSelect id={n.id} name={n.givenName} />
                </TableCell>
                {show('id') && <TableCell className="text-muted-foreground">{n.id}</TableCell>}
                {show('alias') && (
                  <TableCell className="truncate font-medium" title={n.givenName}>
                    {n.givenName}
                  </TableCell>
                )}
                {show('system') && (
                  <TableCell title={netInfo.get(n.id)?.deviceModel || undefined}>
                    <SystemCell os={netInfo.get(n.id)?.os} />
                  </TableCell>
                )}
                {show('location') && (
                  <TableCell className="py-1">
                    <LocationCell id={n.id} location={n.location} options={locationOptions} />
                  </TableCell>
                )}
                {show('ip') && (
                  <TableCell className="font-mono text-xs">
                    {pickIpv4(n.ipAddresses) ?? '—'}
                  </TableCell>
                )}
                {show('lanIp') && (
                  <TableCell className="text-xs">
                    {/* The first one has the highest score (within a subnet it announced, not the .1 gateway, and not a docker range) */}
                    <LanIpCell ips={netInfo.get(n.id)?.lanIps ?? []} />
                  </TableCell>
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
                {show('note') && (
                  <TableCell className="truncate text-sm" title={n.note ?? undefined}>
                    {n.note ? n.note : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                )}
                {show('tags') && (
                  <TableCell className="py-1 whitespace-normal">
                    <TagCell id={n.id} />
                  </TableCell>
                )}
                {show('lastSeen') && (
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtTime(n.lastSeen)}
                  </TableCell>
                )}
                <TableCell className={STICKY_ACTIONS}>
                  <NodeRowActions id={n.id} name={n.givenName} note={n.note ?? undefined} />
                </TableCell>
              </>
            ),
          }))}
        />
      </NodeSelection>
    </div>
  )
}
