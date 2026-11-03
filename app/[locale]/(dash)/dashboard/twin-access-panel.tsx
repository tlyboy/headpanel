'use client'

import { TriangleAlert, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MAX_ACCESS_LINKS,
  type AccessPeer,
  type AccessSubnet,
  type AccessView,
} from './twin-access'

/** Past this the nodes page serves better than a side panel, and the scene still shows them all. */
const PEER_LIST_LIMIT = 100

function Detail({ via, ports }: { via: string[]; ports: string[] }) {
  const t = useTranslations('dashboard')
  const limited = ports.filter((p) => p !== '*')
  return (
    <div className="truncate text-muted-foreground">
      {[
        via.length ? t('twinAccessVia', { via: via.join(', ') }) : null,
        limited.length && limited.length === ports.length
          ? t('twinAccessPorts', { ports: limited.join(', ') })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </div>
  )
}

function PeerRow({ peer }: { peer: AccessPeer }) {
  const t = useTranslations('dashboard')
  const { node } = peer
  return (
    <li className="flex min-w-0 items-start gap-2">
      <span
        className={cn(
          'mt-1 size-2 shrink-0 rounded-full',
          node.online ? 'bg-success' : 'bg-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{node.note ?? node.name}</div>
        <div className="truncate font-mono text-muted-foreground">{node.lanIp ?? node.ip}</div>
        {peer.via.length > 0 && <Detail via={peer.via} ports={peer.ports} />}
      </div>
      {!node.online && (
        <span className="shrink-0 text-muted-foreground">{t('twinLegendOffline')}</span>
      )}
    </li>
  )
}

function SubnetRow({ subnet }: { subnet: AccessSubnet }) {
  const t = useTranslations('dashboard')
  const { gateway } = subnet
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono font-medium">{subnet.cidr}</span>
        {(!gateway || !gateway.serving) && (
          <span className="shrink-0 text-warning">
            {gateway ? t('twinAccessGatewayDown') : t('twinAccessNoGateway')}
          </span>
        )}
      </div>
      {gateway && <div className="truncate text-muted-foreground">{gateway.name}</div>}
      <Detail via={subnet.via} ports={subnet.ports} />
    </li>
  )
}

export function AccessPanel({
  view,
  onClose,
  className,
}: {
  view: AccessView
  onClose: () => void
  className?: string
}) {
  const t = useTranslations('dashboard')
  const { source, peers, subnets, policy } = view
  const isDevice = source !== null

  return (
    <aside
      aria-live="polite"
      aria-label={t('twinAccessLabel', { name: view.title })}
      className={cn(
        'flex flex-col gap-3 overflow-y-auto rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{view.title}</div>
          {source && (
            <div className="truncate font-mono text-muted-foreground">
              {source.lanIp ?? source.ip}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" aria-label={t('twinAccessClose')} onClick={onClose}>
          <X />
        </Button>
      </div>

      {!policy && (
        <p className="flex gap-1.5 text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t('twinAccessUnavailable')}
        </p>
      )}
      {policy && policy.unknown.length > 0 && (
        <p className="flex gap-1.5 text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t('twinAccessUnknown', {
            count: policy.unknown.length,
            items: policy.unknown.join(', '),
          })}
        </p>
      )}

      {(policy || !isDevice) && (
        <>
          {policy && isDevice && peers.length === 0 && subnets.length === 0 && (
            <p className="text-muted-foreground">{t('twinAccessNone')}</p>
          )}
          {peers.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="font-medium">
                {isDevice
                  ? t('twinAccessDevices', { count: peers.length })
                  : t('twinAccessMembers', { count: peers.length })}
              </h4>
              <ul className="flex flex-col gap-2">
                {peers.slice(0, PEER_LIST_LIMIT).map((peer) => (
                  <PeerRow key={peer.node.id} peer={peer} />
                ))}
              </ul>
              {isDevice && peers.length > MAX_ACCESS_LINKS && (
                <p className="text-muted-foreground">
                  {t('twinAccessLinksHidden', { limit: MAX_ACCESS_LINKS })}
                </p>
              )}
              {peers.length > PEER_LIST_LIMIT && (
                <p className="text-muted-foreground">
                  {t('twinAccessMore', { count: peers.length - PEER_LIST_LIMIT })}
                </p>
              )}
            </section>
          )}
          {subnets.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="font-medium">
                {isDevice
                  ? t('twinAccessSubnets', { count: subnets.length })
                  : t('twinAccessTagSubnets', { count: subnets.length })}
              </h4>
              <ul className="flex flex-col gap-2">
                {subnets.map((subnet) => (
                  <SubnetRow key={`${subnet.cidr}|${subnet.gateway?.name ?? ''}`} subnet={subnet} />
                ))}
              </ul>
            </section>
          )}
          {policy && isDevice && (
            <p className="border-t pt-2 text-muted-foreground">{t('twinAccessNote')}</p>
          )}
        </>
      )}
    </aside>
  )
}
