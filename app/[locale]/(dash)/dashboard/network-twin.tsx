'use client'

import { useEffect, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DeviceKindIcon } from '@/components/device-kind-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { DEVICE_KINDS } from '@/lib/device-kind'
import { cn } from '@/lib/utils'
import type { TwinNetwork } from './twin'

const REFRESH_MS = 30_000
const WIDE_QUERY = '(min-width: 640px)'

const TwinScene = dynamic(() => import('./twin-scene'), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0" />,
})

type Mode = 'scene' | 'list' | 'unknown'

let webglSupported: boolean | null = null
function supportsWebgl() {
  webglSupported ??= Boolean(document.createElement('canvas').getContext('webgl2'))
  return webglSupported
}

function subscribeWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useMode(): Mode {
  return useSyncExternalStore<Mode>(
    subscribeWidth,
    () => (window.matchMedia(WIDE_QUERY).matches && supportsWebgl() ? 'scene' : 'list'),
    () => 'unknown',
  )
}

function useAutoRefresh() {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])
}

function TwinList({ network, className }: { network: TwinNetwork; className?: string }) {
  const t = useTranslations('dashboard')
  const kinds = useTranslations('deviceKinds')
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {network.sites.map((site) => (
        <section key={site.key}>
          <h3 className="font-mono text-sm font-medium">{site.cidr ?? t('twinOther')}</h3>
          <p className={cn('text-xs', site.serving ? 'text-muted-foreground' : 'text-destructive')}>
            {site.serving
              ? t('twinOnline', {
                  online: site.nodes.filter((n) => n.online).length,
                  total: site.nodes.length,
                })
              : t('twinDown')}
          </p>
          <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
            {site.nodes.map((node) => (
              <li key={node.id} className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    node.online ? 'bg-success' : 'bg-muted-foreground',
                  )}
                />
                <DeviceKindIcon
                  kind={node.kind}
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{node.name}</span>
                <span className="sr-only">{kinds(node.kind)}</span>
                <span className="sr-only">
                  {node.online ? t('twinLegendOnline') : t('twinLegendOffline')}
                </span>
                {node.id === site.gatewayId && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('twinLegendGateway')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function NetworkTwin({ network, version }: { network: TwinNetwork; version: string }) {
  const t = useTranslations('dashboard')
  const kinds = useTranslations('deviceKinds')
  const mode = useMode()
  useAutoRefresh()

  const nodes = network.sites.flatMap((s) => s.nodes)
  const empty = nodes.length === 0

  return (
    <Card className="flex min-h-[28rem] flex-1 flex-col">
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{t('twinTitle')}</CardTitle>
          <CardDescription>{t('twinDesc')}</CardDescription>
        </div>
        {mode === 'scene' && !empty && (
          <div
            aria-hidden
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
          >
            {DEVICE_KINDS.map((kind) => (
              <span key={kind} className="flex items-center gap-1">
                <DeviceKindIcon kind={kind} className="size-3.5" />
                {kinds(kind)}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-3.5 bg-primary" />
              {t('twinLegendGateway')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 bg-success" />
              {t('twinLegendOnline')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 bg-muted-foreground" />
              {t('twinLegendOffline')}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="relative min-h-0 flex-1">
        {empty ? (
          <p className="text-sm text-muted-foreground">{t('twinEmpty')}</p>
        ) : mode === 'list' ? (
          <TwinList network={network} />
        ) : (
          <>
            {mode === 'scene' && (
              <div
                role="img"
                aria-label={t('twinSceneLabel', {
                  sites: network.sites.length,
                  online: nodes.filter((n) => n.online).length,
                  total: nodes.length,
                })}
              >
                <TwinScene network={network} version={version} />
              </div>
            )}
            <TwinList network={network} className="sr-only" />
          </>
        )}
      </CardContent>
    </Card>
  )
}
