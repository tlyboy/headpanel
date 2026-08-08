import { getMessages, getTranslations } from 'next-intl/server'
import { getHeadscaleVersion, listPreAuthKeys } from '@/lib/headscale'
import { requireSession } from '@/lib/auth'
import { visibleGroups, scopeNodes } from '@/lib/groups'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { isNever } from '@/lib/format'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { ActivityChart } from './activity-chart'
import { auditKind, type AuditKind } from '@/lib/audit'
import { ACTIVITY_TOP_N, type ActivityPoint } from './activity'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations('dashboard'),
  ])
  const groups = visibleGroups(session)
  const hsUserIds = new Set(groups.map((g) => g.hsUserId))
  // Same as the preauthkeys page: super counts all keys, including those in the default section (not assigned to any group).
  // Otherwise, with no groups, this card would always show 0, making it look like all the keys are gone.
  const countUngrouped = session.role === 'super'
  const [allNodes, allKeys, version] = await Promise.all([
    syncAndListNodes(),
    countUngrouped || groups.length > 0 ? listPreAuthKeys() : [],
    getHeadscaleVersion(),
  ])
  const nodes = scopeNodes(session, allNodes)
  // ?user= filtering is broken; fetch them all, then filter by key.user.id (to avoid double-counting across groups)
  let online = 0
  let pending = 0
  for (const node of nodes) {
    if (node.online) online += 1
    if (node.status === 'pending') pending += 1
  }
  // RSC + force-dynamic: render on the server for every request and use the current time to check whether keys have expired, as expected
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  let keyCount = 0
  let validKeys = 0
  for (const key of allKeys) {
    if (!countUngrouped && !hsUserIds.has(key.user?.id ?? '')) continue
    keyCount += 1
    if (isNever(key.expiration) || new Date(key.expiration).getTime() > now) {
      validKeys += 1
    }
  }

  // Among the approved networks, how many currently have nodes actively serving them. This number drops when a serving node goes offline,
  // which is exactly when "the network is currently unreachable" — more useful than listing the total number of networks.
  // Operation frequency over the last 30 days. Filling in zeros is essential — there are 45 days with no records in an 82-day span,
  // and plotting only days with records would make the timeline discontinuous, as if something happened every day.
  const DAYS = 30
  const since = new Date(now - (DAYS - 1) * 86400_000)
  const sinceStr = since.toISOString().slice(0, 10)
  const dayRows = db
    .select({
      d: sql<string>`date(${auditLog.ts})`,
      a: auditLog.action,
      n: sql<number>`count(*)`,
    })
    .from(auditLog)
    .where(
      session.role === 'super'
        ? gte(sql`date(${auditLog.ts})`, sinceStr)
        : and(
            gte(sql`date(${auditLog.ts})`, sinceStr),
            eq(auditLog.groupId, session.gid as number),
          ),
    )
    .groupBy(sql`date(${auditLog.ts})`, auditLog.action)
    .all()

  // The action name key itself contains a dot (node.approve), so it can't go through t()'s namespace resolution
  const actionMap = ((await getMessages()).auditActions ?? {}) as Record<
    string,
    string
  >
  const byDay = new Map<string, Map<string, number>>()
  for (const r of dayRows) {
    const bucket = byDay.get(r.d) ?? new Map<string, number>()
    bucket.set(r.a, (bucket.get(r.a) ?? 0) + Number(r.n))
    byDay.set(r.d, bucket)
  }
  // Translation, bucketing, sorting, and truncation are all done on the server; the client component only renders
  const activity: ActivityPoint[] = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since.getTime() + i * 86400_000)
      .toISOString()
      .slice(0, 10)
    const point: ActivityPoint = {
      date: d,
      success: 0,
      update: 0,
      approve: 0,
      danger: 0,
      total: 0,
      items: [],
    }
    const bucket = byDay.get(d)
    if (!bucket) return point

    const sorted = [...bucket.entries()].sort((a, b) => b[1] - a[1])
    for (const [action, n] of sorted) {
      point[auditKind(action)] += n
      point.total += n
    }
    point.items = sorted.slice(0, ACTIVITY_TOP_N).map(([action, n]) => ({
      label: actionMap[action] ?? action,
      count: n,
      kind: auditKind(action),
    }))
    const rest = sorted.slice(ACTIVITY_TOP_N).reduce((n, [, c]) => n + c, 0)
    if (rest > 0) {
      point.items.push({
        label: t('activityOther'),
        count: rest,
        kind: 'success' as AuditKind,
      })
    }
    return point
  })

  const approvedRoutes = new Set<string>()
  const servingRoutes = new Set<string>()
  for (const n of nodes) {
    for (const r of n.approvedRoutes ?? []) approvedRoutes.add(r)
    for (const r of n.subnetRoutes ?? []) servingRoutes.add(r)
  }

  // Keep only items that trigger an action: change color only when you need to respond, so you can scan at a glance otherwise
  const stats: {
    title: string
    value: string | number
    desc: string
    warn?: boolean
  }[] = [
    {
      title: t('nodesOnline'),
      value: `${online}/${nodes.length}`,
      desc: t('offline', { count: nodes.length - online }),
      warn: nodes.length > 0 && online === 0,
    },
    {
      title: t('subnetServing'),
      value:
        approvedRoutes.size === 0
          ? '—'
          : `${servingRoutes.size}/${approvedRoutes.size}`,
      desc:
        approvedRoutes.size === 0
          ? t('noSubnet')
          : servingRoutes.size < approvedRoutes.size
            ? t('subnetDown', {
                count: approvedRoutes.size - servingRoutes.size,
              })
            : t('subnetAllUp'),
      warn: servingRoutes.size < approvedRoutes.size,
    },
    {
      title: t('pendingNodes'),
      value: pending,
      desc: pending > 0 ? t('hasPending') : t('noPending'),
      warn: pending > 0,
    },
    {
      title: t('validPreAuthKeys'),
      value: validKeys,
      desc: validKeys === 0 ? t('noValidKey') : t('total', { count: keyCount }),
      warn: validKeys === 0,
    },
    // Put the version number last: it's background information and doesn't require anyone to do anything
    {
      title: 'Headscale',
      value: version.version,
      desc: t('apiConnected'),
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.title}>
            <CardHeader className="pb-2">
              <CardDescription>{s.title}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={
                  s.warn ? 'text-warning text-xs' : 'text-muted-foreground text-xs'
                }
              >
                {s.desc}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="flex min-h-72 flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-base">{t('activityTitle')}</CardTitle>
          <CardDescription>{t('activityDesc', { days: 30 })}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ActivityChart data={activity} />
        </CardContent>
      </Card>
    </div>
  )
}
