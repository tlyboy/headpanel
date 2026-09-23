import { and, count, desc, eq, gte, like, or, sql, type SQL } from 'drizzle-orm'
import { getMessages, getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { fmtTime } from '@/lib/format'
import { ListFilters } from '@/components/list-filters'
import { ColumnFilter } from '@/components/column-filter'
import {
  columnCookieName,
  makeIsVisible,
  parseHidden,
  visibleCount,
  type ColumnDef,
} from '@/components/columns'
import { ListPager } from '@/components/list-pager'
import { resolvePerPage } from '@/components/pager'
import {
  auditKind,
  AUDIT_KIND_VARIANT,
  displayTarget,
  legacyNodeId,
} from '@/lib/audit'
import { listNodes } from '@/lib/headscale'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

const PAGE = 'audit'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, t, messages, sp, cookieStore] = await Promise.all([
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
  const q = one('q')
  const action = one('action')
  const page = Math.max(1, Number(one('page')) || 1)
  const perPage = resolvePerPage(one('per'))
  // range is either today/7d/30d or a specific day — the latter is what a bar on the overview page links to.
  // Using one parameter for both means the filter row only needs one dropdown, and "Clear" works as usual.
  const range = one('range')
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(range)

  // Group admins only see their group's audit logs; super sees everything. All filters are included in the SQL,
  // whereas before we fetched 200 rows and then truncated — there are already 200+ audit records, so the oldest ones were never visible.
  const conds: SQL[] = []
  if (session.role !== 'super') {
    conds.push(eq(auditLog.groupId, session.gid as number))
  }
  if (action) conds.push(eq(auditLog.action, action))
  if (isDay) {
    conds.push(eq(sql`date(${auditLog.ts})`, range))
  } else if (range) {
    // Use the same basis as the overview chart (both bucket by date(ts)); otherwise the counts won't match when you click through.
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30
    // RSC + force-dynamic: the current time is fetched on the server for every request, as expected.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    const since = new Date(now - (days - 1) * 86400_000)
      .toISOString()
      .slice(0, 10)
    conds.push(gte(sql`date(${auditLog.ts})`, since))
  }
  if (q) {
    const kw = `%${q}%`
    const m = or(
      like(auditLog.actor, kw),
      like(auditLog.target, kw),
      like(auditLog.detail, kw),
    )
    if (m) conds.push(m)
  }
  const where = conds.length ? and(...conds) : undefined

  const total =
    db.select({ n: count() }).from(auditLog).where(where).get()?.n ?? 0
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const columns: ColumnDef[] = [
    { key: 'time', label: t('time') },
    { key: 'actor', label: t('actor') },
    { key: 'action', label: t('action') },
    { key: 'target', label: t('target') },
    { key: 'detail', label: t('detail') },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)

  const current = Math.min(page, pageCount)
  const rows = db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.id))
    .limit(perPage)
    .offset((current - 1) * perPage)
    .all()

  // Older records only stored the node ID. Only if this page actually has such a record do we call headscale
  // once to get the node list and fill in the names; if that fails (headscale is unavailable), display the ID as before.
  const nodeNames = new Map<string, string>()
  if (rows.some((r) => legacyNodeId(r.action, r.target))) {
    try {
      for (const n of await listNodes()) nodeNames.set(n.id, n.givenName)
    } catch {
      // Filling in names is just a nice-to-have and doesn't affect the audit list itself.
    }
  }

  // Only list actions that actually appear in the dropdown, so we don't pile on options that don't exist in this deployment.
  const actions = db
    .selectDistinct({ a: auditLog.action })
    .from(auditLog)
    .where(
      session.role === 'super'
        ? undefined
        : eq(auditLog.groupId, session.gid as number),
    )
    .all()
    .map((r) => r.a)
    .sort()

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        placeholder={t('searchPlaceholder')}
        columns={
          <ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />
        }
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {show('time') && (
                <TableHead className="w-44">{t('time')}</TableHead>
              )}
              {show('actor') && <TableHead>{t('actor')}</TableHead>}
              {show('action') && <TableHead>{t('action')}</TableHead>}
              {show('target') && <TableHead>{t('target')}</TableHead>}
              {show('detail') && <TableHead>{t('detail')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCount(columns, hidden)}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="[contain-intrinsic-size:0_49px] [content-visibility:auto]"
                >
                  {show('time') && (
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtTime(r.ts.replace(' ', 'T') + 'Z')}
                    </TableCell>
                  )}
                  {show('actor') && (
                    <TableCell className="text-xs">{r.actor ?? '—'}</TableCell>
                  )}
                  {show('action') && (
                    <TableCell>
                      <Badge variant={AUDIT_KIND_VARIANT[auditKind(r.action)]}>
                        {actionLabel(r.action)}
                      </Badge>
                    </TableCell>
                  )}
                  {show('target') && (
                    <TableCell className="text-xs">
                      {displayTarget(r.action, r.target, nodeNames) ?? '—'}
                    </TableCell>
                  )}
                  {show('detail') && (
                    <TableCell className="text-xs text-muted-foreground">
                      {r.detail ?? '—'}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ListPager
        page={current}
        pageCount={pageCount}
        total={total}
        perPage={perPage}
      />
    </div>
  )
}
