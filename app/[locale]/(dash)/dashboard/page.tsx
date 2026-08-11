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
  // 与 preauthkeys 页一致：super 统计全部 key，含默认区（不归任何组）的那些。
  // 否则零组时这张卡恒为 0，看着像 key 都没了。
  const countUngrouped = session.role === 'super'
  const [allNodes, allKeys, version] = await Promise.all([
    syncAndListNodes(),
    countUngrouped || groups.length > 0 ? listPreAuthKeys() : [],
    getHeadscaleVersion(),
  ])
  const nodes = scopeNodes(session, allNodes)
  // ?user= 过滤失效，拉全部后按 key.user.id 归属过滤（避免多组重复计数）
  let online = 0
  let pending = 0
  for (const node of nodes) {
    if (node.online) online += 1
    if (node.status === 'pending') pending += 1
  }
  // RSC + force-dynamic：每次请求服务端渲染，取当前时间判断 key 是否过期，符合预期
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

  // 已批准的网段里，当前真有节点在承载的有几条。承载方掉线时这里会少，
  // 那正是「网段现在不通」的时刻——比列一个网段总数有用。
  // 最近 30 天的操作频率。补零是必须的——82 天里有 45 天没有任何记录，
  // 只画有记录的天会让时间轴不连续，看着像每天都在动。
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

  // 动作名的键本身带点（node.approve），不能走 t() 的命名空间解析
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
  // 翻译、分档、排序、截断都在服务端做完，客户端组件只负责画
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

  // 只留会引发动作的项：需要你反应时才变色，平时一眼扫过即可
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
    // 版本号放最后：属于背景信息，不需要谁为它做什么
    {
      title: 'Headscale',
      value: version.version,
      desc: t('apiConnected'),
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
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
                  s.warn
                    ? 'text-xs text-warning'
                    : 'text-xs text-muted-foreground'
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
