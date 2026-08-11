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
import { auditKind, AUDIT_KIND_VARIANT } from '@/lib/audit'
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
  // action 存的是 route.approve 这类内部标识。不能用 t('auditActions.xxx')：
  // next-intl 把点当命名空间分隔符，会去找 auditActions.route 这个对象，
  // 而键本身就带点，永远查不中。直接读消息对象，查不到就原样显示。
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
  // range 要么是 today/7d/30d，要么直接是一天——概览页的柱子就跳到后者。
  // 用同一个参数装两种，筛选行才只需要一个下拉，「清除」也照常管用。
  const range = one('range')
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(range)

  // 组管理员只看本组审计；super 看全部。筛选条件都拼进 SQL，
  // 之前是取 200 条再截断——审计已经 200+ 条，最老的记录直接看不到了。
  const conds: SQL[] = []
  if (session.role !== 'super') {
    conds.push(eq(auditLog.groupId, session.gid as number))
  }
  if (action) conds.push(eq(auditLog.action, action))
  if (isDay) {
    conds.push(eq(sql`date(${auditLog.ts})`, range))
  } else if (range) {
    // 与概览图表同一口径（都按 date(ts) 分桶），否则点进来条数对不上
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30
    // RSC + force-dynamic：每次请求都在服务端取当前时间，符合预期
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

  // 下拉只列实际出现过的动作，省得堆一串这个部署里根本没有的选项
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
            // 从图表点进来的具体某天，作为一个已选中的选项出现，
            // 换成别的区间它自然消失——不需要额外的「取消这天」控件
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
                    <TableCell className="text-xs">{r.target ?? '—'}</TableCell>
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
