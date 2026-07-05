import { getTranslations } from 'next-intl/server'
import { listPreAuthKeys } from '@/lib/headscale'
import { requireSession } from '@/lib/auth'
import { visibleGroups, scopeNodes } from '@/lib/groups'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { isNever } from '@/lib/format'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await requireSession()
  const [t, common] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('common'),
  ])
  const groups = visibleGroups(session)
  const hsUserIds = new Set(groups.map((g) => g.hsUserId))
  const [allNodes, allKeys] = await Promise.all([
    syncAndListNodes(),
    groups.length > 0 ? listPreAuthKeys(groups[0].hsUserId) : [],
  ])
  const nodes = scopeNodes(session, allNodes)
  // ?user= 过滤失效，拉全部后按 key.user.id 归属过滤（避免多组重复计数）
  const keys = allKeys.filter((k) => hsUserIds.has(k.user?.id ?? ''))

  const online = nodes.filter((n) => n.online).length
  const pending = nodes.filter((n) => n.status === 'pending').length
  // RSC + force-dynamic：每次请求服务端渲染，取当前时间判断 key 是否过期，符合预期
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const validKeys = keys.filter(
    (k) => isNever(k.expiration) || new Date(k.expiration).getTime() > now,
  ).length

  const stats = [
    {
      title: t('totalNodes'),
      value: nodes.length,
      desc: t('online', { count: online }),
    },
    {
      title: t('onlineNodes'),
      value: online,
      desc: t('offline', { count: nodes.length - online }),
    },
    {
      title: t('pendingNodes'),
      value: pending,
      desc: pending > 0 ? t('hasPending') : t('noPending'),
    },
    {
      title: session.role === 'super' ? t('groupCount') : t('currentGroup'),
      value: groups.length,
      desc:
        session.role === 'super'
          ? t('allGroups')
          : (groups[0]?.name ?? common('unknown')),
    },
    {
      title: t('validPreAuthKeys'),
      value: validKeys,
      desc: t('total', { count: keys.length }),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('description')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.title}>
            <CardHeader className="pb-2">
              <CardDescription>{s.title}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
