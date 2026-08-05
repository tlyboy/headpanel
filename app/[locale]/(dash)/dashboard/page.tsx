import { getTranslations } from 'next-intl/server'
import { getHeadscaleVersion, listPreAuthKeys } from '@/lib/headscale'
import { requireSession } from '@/lib/auth'
import { visibleGroups, scopeNodes } from '@/lib/groups'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { isNever } from '@/lib/format'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
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
    if (!hsUserIds.has(key.user?.id ?? '')) continue
    keyCount += 1
    if (isNever(key.expiration) || new Date(key.expiration).getTime() > now) {
      validKeys += 1
    }
  }

  // 已批准的网段里，当前真有节点在承载的有几条。承载方掉线时这里会少，
  // 那正是「网段现在不通」的时刻——比列一个网段总数有用。
  // 已离线节点的 last_seen 就是它掉线的那一刻——这半个历史是免费的，
  // 需要采集的是在线节点的波动，那个另说。
  const DAY = 86400_000
  const stale = nodes
    .filter((n) => !n.online && !isNever(n.lastSeen))
    .map((n) => ({
      id: n.id,
      name: n.givenName,
      days: Math.floor((now - new Date(n.lastSeen).getTime()) / DAY),
    }))
    .filter((n) => n.days >= 7)
    .sort((a, b) => b.days - a.days)

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
      title: 'Headscale',
      value: version.version,
      desc: t('apiConnected'),
    },
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
  ]

  return (
    <div className="flex flex-col gap-4">
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

      {stale.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('staleTitle')}</CardTitle>
            <CardDescription>
              {t('staleDesc', { count: stale.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {stale.slice(0, 8).map((n) => (
              <Link
                key={n.id}
                href={{ pathname: '/nodes', query: { q: n.name } }}
                className="hover:bg-muted flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors"
              >
                <span className="truncate">{n.name}</span>
                <Badge variant={n.days >= 30 ? 'warning' : 'secondary'}>
                  {t('staleDays', { days: n.days })}
                </Badge>
              </Link>
            ))}
            {stale.length > 8 && (
              <p className="text-muted-foreground px-2 pt-1 text-xs">
                {t('staleMore', { count: stale.length - 8 })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
