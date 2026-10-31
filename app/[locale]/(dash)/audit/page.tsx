import { getMessages, getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { ListFilters } from '@/components/list-filters'
import { ColumnFilter } from '@/components/column-filter'
import { columnCookieName, makeIsVisible, parseHidden, type ColumnDef } from '@/components/columns'
import { auditTotal, loadAuditBatch, type AuditFilters } from '@/lib/audit-list'
import { AuditList, type AuditCol } from './audit-list'

const PAGE = 'audit'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [, t, messages, sp, cookieStore] = await Promise.all([
    requireSession(),
    getTranslations('audit'),
    getMessages(),
    searchParams,
    cookies(),
  ])
  // action stores internal identifiers such as route.approve. Don't use t('auditActions.xxx'):
  // next-intl treats dots as namespace separators and looks for an auditActions.route object,
  // but the key itself contains a dot, so it will never match. Read the message object directly; if there's no match, display the value as-is.
  const actionMap = (messages.auditActions ?? {}) as Record<string, string>
  const actionLabel = (a: string) => actionMap[a] ?? a
  const one = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v)?.trim() || ''
  }
  // range is either today/7d/30d or a specific day — the latter is what a bar on the overview page links to.
  // Using one parameter for both means the filter row only needs one dropdown, and "Clear" works as usual.
  const range = one('range')
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(range)
  const filters: AuditFilters = { q: one('q'), action: one('action'), range }
  const [first, total] = await Promise.all([loadAuditBatch(filters), auditTotal(filters)])

  const columns: ColumnDef[] = [
    { key: 'time', label: t('time') },
    { key: 'actor', label: t('actor') },
    { key: 'action', label: t('action') },
    { key: 'target', label: t('target') },
    { key: 'detail', label: t('detail') },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)

  // Only list actions that actually appear in the dropdown, so we don't pile on options that don't exist in this deployment.
  const actions = db
    .selectDistinct({ a: auditLog.action })
    .from(auditLog)
    .all()
    .map((r) => r.a)
    .sort()

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        placeholder={t('searchPlaceholder')}
        columns={<ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />}
        selects={[
          {
            name: 'range',
            placeholder: t('allTime'),
            // A specific day clicked from the chart appears as a selected option,
            // and naturally disappears when you switch to another range — no extra "Clear this day" control needed.
            options: [
              ...(isDay ? [{ value: range, label: range }] : []),
              { value: 'today', label: t('today') },
              { value: '7d', label: t('last7d') },
              { value: '30d', label: t('last30d') },
            ],
          },
          {
            name: 'action',
            placeholder: t('allActions'),
            options: actions
              .map((a) => ({ value: a, label: actionLabel(a) }))
              .sort((x, y) => x.label.localeCompare(y.label)),
          },
        ]}
      />

      <AuditList
        key={JSON.stringify(filters)}
        first={first}
        filters={filters}
        total={total}
        visible={columns.map((c) => c.key).filter((k): k is AuditCol => show(k))}
      />
    </div>
  )
}
