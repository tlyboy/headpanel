import { getTranslations } from 'next-intl/server'
import { getHeadscaleVersion, listPreAuthKeys } from '@/lib/headscale'
import { requireSession } from '@/lib/auth'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { isNever } from '@/lib/format'
import { readNodeNetInfo } from '@/lib/headscale-db'
import { NetworkTwin } from './network-twin'
import { buildTwin } from './twin-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [, t, { tag }] = await Promise.all([
    requireSession(),
    getTranslations('dashboard'),
    searchParams,
  ])
  const [nodes, allKeys, version] = await Promise.all([
    syncAndListNodes(),
    listPreAuthKeys(),
    getHeadscaleVersion(),
  ])
  let online = 0
  let pending = 0
  for (const node of nodes) {
    if (node.online) online += 1
    if (node.status === 'pending') pending += 1
  }
  // Rendered per request (requireSession above reads the cookie), so we check whether keys have expired based on the current time, as expected
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  let keyCount = 0
  let validKeys = 0
  for (const key of allKeys) {
    keyCount += 1
    if (isNever(key.expiration) || new Date(key.expiration).getTime() > now) {
      validKeys += 1
    }
  }

  // Among the approved networks, how many currently have nodes actively serving them. This number drops when a serving node goes offline,
  // which is exactly when "the network is currently unreachable" — more useful than listing the total number of networks.
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
    href?: '/nodes' | '/subnets' | '/preauthkeys'
  }[] = [
    {
      title: t('nodesOnline'),
      value: `${online}/${nodes.length}`,
      desc: t('offline', { count: nodes.length - online }),
      warn: nodes.length > 0 && online === 0,
      href: '/nodes',
    },
    {
      title: t('subnetServing'),
      value: approvedRoutes.size === 0 ? '—' : `${servingRoutes.size}/${approvedRoutes.size}`,
      desc:
        approvedRoutes.size === 0
          ? t('noSubnet')
          : servingRoutes.size < approvedRoutes.size
            ? t('subnetDown', {
                count: approvedRoutes.size - servingRoutes.size,
              })
            : t('subnetAllUp'),
      warn: servingRoutes.size < approvedRoutes.size,
      href: '/subnets',
    },
    {
      title: t('pendingNodes'),
      value: pending,
      desc: pending > 0 ? t('hasPending') : t('noPending'),
      warn: pending > 0,
      href: '/nodes',
    },
    {
      title: t('validPreAuthKeys'),
      value: validKeys,
      desc: validKeys === 0 ? t('noValidKey') : t('total', { count: keyCount }),
      warn: validKeys === 0,
      href: '/preauthkeys',
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => {
          const card = (
            <Card className={s.href ? 'h-full transition-colors hover:bg-muted/50' : 'h-full'}>
              <CardHeader className="pb-2">
                <CardDescription>{s.title}</CardDescription>
                <CardTitle className="text-3xl">{s.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={s.warn ? 'text-xs text-warning' : 'text-xs text-muted-foreground'}>
                  {s.desc}
                </p>
              </CardContent>
            </Card>
          )
          return s.href ? (
            <Link key={s.title} href={s.href}>
              {card}
            </Link>
          ) : (
            <div key={s.title}>{card}</div>
          )
        })}
      </div>

      <NetworkTwin
        network={buildTwin(nodes, readNodeNetInfo())}
        version={version.version}
        initialTags={[tag ?? []].flat()}
      />
    </div>
  )
}
