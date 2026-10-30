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
import { columnCookieName, makeIsVisible, parseHidden, type ColumnDef } from '@/components/columns'
import { PendingCard } from './pending-card'
import { NodeSelection } from './selection'
import { NodesTable, type NodeCol } from './nodes-table'

const PAGE = 'nodes'

export const dynamic = 'force-dynamic'

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
    { key: 'id', label: 'ID' },
    { key: 'alias', label: t('alias') },
    { key: 'ip', label: 'IP' },
    { key: 'lanIp', label: t('lanIp') },
    { key: 'online', label: common('online') },
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
  const tagFilter = one('tag')

  const all = await syncAndListNodes()
  // LAN addresses can only be read from the headscale database; for deployments on separate hosts, return an empty table, and display — in this column
  const netInfo = readNodeNetInfo()
  const tagOptions = declaredTags()

  // Pending nodes get their own card above the list; rejected ones are deleted from headscale.
  const pending = all.filter((n) => n.status === 'pending')
  // Search includes LAN IPs: when locating a machine, the address you have on hand is often that one
  const nodes = all.filter((n) => {
    if (n.status === 'pending') return false
    if (status === 'online' && !n.online) return false
    if (status === 'offline' && n.online) return false
    if (tagFilter && !n.tags.includes(tagFilter)) return false
    if (!q) return true
    const hay = [
      n.givenName,
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
    <div className="flex h-full min-h-0 flex-col gap-4">
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
        ]}
      />

      <NodeSelection
        tagsById={Object.fromEntries(nodes.map((n) => [n.id, n.tags]))}
        tagCounts={Object.fromEntries(
          tagOptions.map((tag) => [tag, all.filter((n) => n.tags.includes(tag)).length]),
        )}
        defaultTag={approvedTag()}
      >
        <NodesTable
          visible={columns
            .map((c) => c.key)
            .filter((k): k is NodeCol => k !== 'actions' && show(k))}
          rows={nodes.map((n) => ({
            id: n.id,
            name: n.givenName,
            ip: pickIpv4(n.ipAddresses) ?? '—',
            // The first one has the highest score (within a subnet it announced, not the .1 gateway, and not a docker range)
            lanIps: netInfo.get(n.id)?.lanIps ?? [],
            online: n.online,
            note: n.note ?? null,
            lastSeen: fmtTime(n.lastSeen),
          }))}
        />
      </NodeSelection>
    </div>
  )
}
