import { getTranslations } from 'next-intl/server'
import { getHeadscaleVersion, listPreAuthKeys } from '@/lib/headscale'
import { requireSession } from '@/lib/auth'
import { visibleGroups, scopeNodes } from '@/lib/groups'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { isNever } from '@/lib/format'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import {
  ACTIVITY_KEYS,
  ActivityChart,
  type ActivityPoint,
} from './activity-chart'
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
  const [allNodes, allKeys, version] = await Promise.all([
    syncAndListNodes(),
    groups.length > 0 ? listPreAuthKeys() : [],
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
    if (!hsUserIds.has(key.user?.id ?? '')) continue
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

  // Group 16 specific actions into 5 broad categories by prefix: 5 rows fit in the hover card; 16 don't
  const catOf = (a: string): (typeof ACTIVITY_KEYS)[number] => {
    if (a.startsWith('node.')) return 'node'
    if (a.startsWith('route.') || a.startsWith('policy.')) return 'route'
    if (a.startsWith('group.')) return 'group'
    if (a.startsWith('preauthkey.') || a.startsWith('accesskey.')) return 'key'
    return 'auth'
  }
  const byDay = new Map<string, Record<string, number>>()
  for (const r of dayRows) {
    const bucket = byDay.get(r.d) ?? {}
    bucket[catOf(r.a)] = (bucket[catOf(r.a)] ?? 0) + Number(r.n)
    byDay.set(r.d, bucket)
  }
  const activity = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since.getTime() + i * 86400_000)
      .toISOString()
      .slice(0, 10)
    const b = byDay.get(d) ?? {}
    const point = { date: d, total: 0 } as ActivityPoint
    for (const k of ACTIVITY_KEYS) {
      point[k] = b[k] ?? 0
      point.total += point[k]
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

      <Card className="flex min-h-64 flex-1 flex-col">
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
