import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { listNodes } from '@/lib/headscale'
import { readHeadscaleNetworkConfig } from '@/lib/headscale-config'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NetworkForm } from './network-form'

export const dynamic = 'force-dynamic'

export default async function NetworkPage() {
  await requireSuper()
  const [t, common] = await Promise.all([
    getTranslations('network'),
    getTranslations('common'),
  ])
  const [config, nodes] = await Promise.all([
    readHeadscaleNetworkConfig(),
    listNodes(),
  ])
  const usedIpv4 = nodes
    .flatMap((n) => n.ipAddresses.filter((ip) => ip.includes('.')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('description')}
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-md border p-4">
          <div className="mb-4">
            <h2 className="font-medium">{t('addressPool')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('configFile')}<span className="font-mono">{config.configPath}</span>
            </p>
          </div>
          <NetworkForm ipv4Prefix={config.ipv4Prefix} usedIpv4={usedIpv4} />
        </div>

        <div className="rounded-md border p-4">
          <h2 className="mb-3 font-medium">{t('currentConfig')}</h2>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">IPv4</dt>
              <dd className="font-mono">{config.ipv4Prefix}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">IPv6</dt>
              <dd className="font-mono">{config.ipv6Prefix ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('allocation')}</dt>
              <dd>{config.allocation ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('usedIpv4')}</dt>
              <dd>
                <Badge variant="secondary">{t('count', { count: usedIpv4.length })}</Badge>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>{t('nodes')}</TableHead>
              <TableHead>IPv4</TableHead>
              <TableHead>{t('online')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="text-muted-foreground">{n.id}</TableCell>
                <TableCell className="font-medium">{n.givenName}</TableCell>
                <TableCell className="font-mono text-xs">
                  {n.ipAddresses.find((ip) => ip.includes('.')) ?? '—'}
                </TableCell>
                <TableCell>
                  {n.online ? (
                    <Badge className="bg-emerald-600 text-white">{common('online')}</Badge>
                  ) : (
                    <Badge variant="secondary">{common('offline')}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
