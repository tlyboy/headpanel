import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSuper } from '@/lib/auth'
import { onlyIpv4 } from '@/lib/format'
import { listNodes } from '@/lib/headscale'
import {
  isHeadscaleHostControlEnabled,
  readHeadscaleNetworkConfig,
} from '@/lib/headscale-config'
import { Badge } from '@/components/ui/badge'
import { NetworkForm } from './network-form'

export const dynamic = 'force-dynamic'

export default async function NetworkPage() {
  const [, t] = await Promise.all([requireSuper(), getTranslations('network')])
  if (!isHeadscaleHostControlEnabled()) notFound()
  const [config, nodes] = await Promise.all([
    readHeadscaleNetworkConfig(),
    listNodes(),
  ])
  const usedIpv4 = nodes
    .flatMap((n) => onlyIpv4(n.ipAddresses))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-md border p-4">
          <div className="mb-4">
            <h2 className="font-medium">{t('addressPool')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('configFile')}
              <span className="font-mono">{config.configPath}</span>
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
                <Badge variant="secondary">
                  {t('count', { count: usedIpv4.length })}
                </Badge>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}
