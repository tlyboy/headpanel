'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { CircleHelp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OsIcon, osLabel, osLogoPath } from '@/components/os-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { isServing, type TwinNetwork } from './twin'
import { buildAccessView, toHighlight, type AccessPolicy, type TwinSelection } from './twin-access'
import { AccessPanel } from './twin-access-panel'

const REFRESH_MS = 30_000
/** The hidden list exists for screen readers. Past this size the nodes page serves them better. */
const HIDDEN_LIST_LIMIT = 300
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

function TwinList({
  network,
  onSelectNode,
  className,
}: {
  network: TwinNetwork
  onSelectNode: (id: string) => void
  className?: string
}) {
  const t = useTranslations('dashboard')
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {network.sites.map((site) => (
        <section key={site.key}>
          <h3 className="text-sm font-medium">
            {site.location ?? (site.cidrs.join(', ') || t('twinOther'))}
          </h3>
          <p
            className={cn(
              'text-xs',
              isServing(site) ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {isServing(site)
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
                {node.os && (
                  <OsIcon os={node.os} className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <button
                  type="button"
                  className="truncate text-left underline-offset-2 hover:underline"
                  onClick={() => onSelectNode(node.id)}
                >
                  {node.name}
                </button>
                {node.os && <span className="sr-only">{osLabel(node.os)}</span>}
                <span className="sr-only">
                  {node.online ? t('twinLegendOnline') : t('twinLegendOffline')}
                </span>
                {site.gateways.some((g) => g.id === node.id) && (
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

export function NetworkTwin({
  network,
  policy,
  version,
}: {
  network: TwinNetwork
  policy: AccessPolicy | null
  version: string
}) {
  const t = useTranslations('dashboard')
  const mode = useMode()
  useAutoRefresh()
  const [selection, setSelection] = useState<TwinSelection | null>(null)
  // A selected device or tag may disappear on refresh, and the view then simply closes
  const view = selection && buildAccessView(network, policy, selection)
  const highlight = toHighlight(view)
  const open = view !== null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const selectNode = (id: string | null) =>
    setSelection(
      id === null || (selection?.kind === 'node' && selection.id === id)
        ? null
        : { kind: 'node', id },
    )

  const nodes = network.sites.flatMap((s) => s.nodes)
  const empty = nodes.length === 0
  const systems = [...new Set(nodes.flatMap((n) => n.os ?? []))].sort()
  const hasNoLogo = nodes.some((n) => !osLogoPath(n.os))
  const tags = [...new Set(nodes.flatMap((n) => n.tags))].sort()

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
            {systems
              .filter((os) => osLogoPath(os))
              .map((os) => (
                <span key={os} className="flex items-center gap-1">
                  <OsIcon os={os} className="size-3.5" />
                  {osLabel(os)}
                </span>
              ))}
            {hasNoLogo && (
              <span className="flex items-center gap-1">
                <CircleHelp className="size-3.5" />
                {t('twinOsUnknown')}
              </span>
            )}
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
      {tags.length > 0 && !empty && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 text-xs text-muted-foreground">
          <span>{t('twinTagFilter')}</span>
          {tags.map((tag) => {
            const active = selection?.kind === 'tag' && selection.tag === tag
            return (
              <Button
                key={tag}
                variant={active ? 'default' : 'outline'}
                size="xs"
                aria-pressed={active}
                onClick={() => setSelection(active ? null : { kind: 'tag', tag })}
              >
                {tag}
              </Button>
            )
          })}
        </div>
      )}
      <CardContent className="relative min-h-0 flex-1">
        {empty ? (
          <p className="text-sm text-muted-foreground">{t('twinEmpty')}</p>
        ) : mode === 'list' ? (
          <>
            {view && (
              <AccessPanel view={view} onClose={() => setSelection(null)} className="mb-4" />
            )}
            <TwinList network={network} onSelectNode={selectNode} />
          </>
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
                <TwinScene
                  network={network}
                  version={version}
                  highlight={highlight}
                  onSelectNode={selectNode}
                />
              </div>
            )}
            {nodes.length <= HIDDEN_LIST_LIMIT && (
              <TwinList network={network} onSelectNode={selectNode} className="sr-only" />
            )}
            {view && (
              <AccessPanel
                view={view}
                onClose={() => setSelection(null)}
                className="absolute top-0 right-6 z-10 max-h-full w-72"
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
