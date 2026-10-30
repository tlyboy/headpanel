'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Badge } from '@/components/ui/badge'
import { LanIpCell } from '@/components/lan-ip-cell'
import { STICKY_ACTIONS } from '@/lib/table'
import { cn } from '@/lib/utils'
import { NodeRowActions } from './row-actions'
import { RowSelect, SelectAll, TagCell } from './selection'

export interface NodeRow {
  id: string
  name: string
  ip: string
  lanIps: string[]
  online: boolean
  note: string | null
  // Formatted on the server so the client renders the same text it was sent
  lastSeen: string
}

export type NodeCol = 'id' | 'alias' | 'ip' | 'lanIp' | 'online' | 'note' | 'tags' | 'lastSeen'

const HEAD = 'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground'
const CELL = 'p-2 align-middle whitespace-nowrap'

// Rows are virtualized inside their own scroll box, so the header can stick to its top
export function NodesTable({ rows, visible }: { rows: NodeRow[]; visible: NodeCol[] }) {
  const t = useTranslations('nodes')
  const common = useTranslations('common')
  const scroller = useRef<HTMLDivElement>(null)
  // The compiler already skips this component; nothing here is passed to memoized children
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 45,
    overscan: 10,
    getItemKey: (i) => rows[i].id,
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)
  const show = (c: NodeCol) => visible.includes(c)
  const span = visible.length + 2

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--border)]">
          <tr>
            <th className={cn(HEAD, 'w-10')}>
              <SelectAll />
            </th>
            {show('id') && <th className={cn(HEAD, 'w-12')}>ID</th>}
            {show('alias') && <th className={HEAD}>{t('alias')}</th>}
            {show('ip') && <th className={HEAD}>IP</th>}
            {show('lanIp') && <th className={HEAD}>{t('lanIp')}</th>}
            {show('online') && <th className={HEAD}>{common('online')}</th>}
            {show('note') && <th className={HEAD}>{t('note')}</th>}
            {show('tags') && <th className={HEAD}>{t('tags')}</th>}
            {show('lastSeen') && <th className={HEAD}>{t('lastSeen')}</th>}
            {/* No title: a column of ⋯ menus needs none, and the width goes to the data */}
            <th className={cn(HEAD, STICKY_ACTIONS, 'z-30')} aria-label={t('actions')} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={span} className="py-8 text-center text-muted-foreground">
                {t('empty')}
              </td>
            </tr>
          )}
          {padTop > 0 && (
            <tr aria-hidden>
              <td colSpan={span} style={{ height: padTop, padding: 0 }} />
            </tr>
          )}
          {items.map((item) => {
            const n = rows[item.index]
            return (
              <tr
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="group/row border-b transition-colors hover:bg-muted/50"
              >
                <td className={CELL}>
                  <RowSelect id={n.id} name={n.name} />
                </td>
                {show('id') && <td className={cn(CELL, 'text-muted-foreground')}>{n.id}</td>}
                {show('alias') && <td className={cn(CELL, 'font-medium')}>{n.name}</td>}
                {show('ip') && <td className={cn(CELL, 'font-mono text-xs')}>{n.ip}</td>}
                {show('lanIp') && (
                  <td className={cn(CELL, 'text-xs')}>
                    <LanIpCell ips={n.lanIps} />
                  </td>
                )}
                {show('online') && (
                  <td className={CELL}>
                    {n.online ? (
                      <Badge variant="success">{common('online')}</Badge>
                    ) : (
                      <Badge variant="secondary">{common('offline')}</Badge>
                    )}
                  </td>
                )}
                {show('note') && (
                  <td className={cn(CELL, 'max-w-[14rem] truncate')}>
                    {n.note || <span className="text-muted-foreground">—</span>}
                  </td>
                )}
                {show('tags') && (
                  <td className={cn(CELL, 'py-1 whitespace-normal')}>
                    <TagCell id={n.id} />
                  </td>
                )}
                {show('lastSeen') && (
                  <td className={cn(CELL, 'text-xs text-muted-foreground')}>{n.lastSeen}</td>
                )}
                <td className={cn(CELL, STICKY_ACTIONS)}>
                  <NodeRowActions id={n.id} name={n.name} note={n.note ?? undefined} />
                </td>
              </tr>
            )
          })}
          {padBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={span} style={{ height: padBottom, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
