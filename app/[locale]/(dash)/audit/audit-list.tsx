'use client'

import { useCallback, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableHead } from '@/components/ui/table'
import { VirtualTable } from '@/components/virtual-table'
import type { AuditBatch, AuditFilters } from '@/lib/audit-list'
import { loadMoreAuditAction } from './actions'

export type AuditCol = 'time' | 'actor' | 'action' | 'target' | 'detail'

// Starts with the first batch from the server and fetches the next one as you scroll near the bottom.
// The page keys this by its filters, so changing a filter starts over.
export function AuditList({
  first,
  filters,
  total,
  visible,
}: {
  first: AuditBatch
  filters: AuditFilters
  total: number
  visible: AuditCol[]
}) {
  const t = useTranslations('audit')
  const common = useTranslations('common')
  const [rows, setRows] = useState(first.rows)
  const [next, setNext] = useState(first.next)
  const [loading, start] = useTransition()
  const show = (c: AuditCol) => visible.includes(c)

  const loadMore = useCallback(() => {
    if (next == null || loading) return
    start(async () => {
      try {
        const batch = await loadMoreAuditAction(filters, next)
        setRows((prev) => [...prev, ...batch.rows])
        setNext(batch.next)
      } catch {
        toast.error(common('operationFailed'))
      }
    })
  }, [next, loading, filters, common])

  return (
    <VirtualTable
      colSpan={visible.length}
      empty={t('empty')}
      onEndReached={loadMore}
      footer={
        rows.length > 0 && (
          <p className="flex items-center justify-center gap-2 border-t py-3 text-xs text-muted-foreground">
            {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {next == null
              ? t('allLoaded', { count: total })
              : t('loadedOf', { loaded: rows.length, total })}
          </p>
        )
      }
      head={
        <>
          {show('time') && <TableHead className="w-44">{t('time')}</TableHead>}
          {show('actor') && <TableHead>{t('actor')}</TableHead>}
          {show('action') && <TableHead>{t('action')}</TableHead>}
          {show('target') && <TableHead>{t('target')}</TableHead>}
          {show('detail') && <TableHead>{t('detail')}</TableHead>}
        </>
      }
      rows={rows.map((r) => ({
        key: String(r.id),
        cells: (
          <>
            {show('time') && (
              <TableCell className="text-xs text-muted-foreground">{r.time}</TableCell>
            )}
            {show('actor') && <TableCell className="text-xs">{r.actor}</TableCell>}
            {show('action') && (
              <TableCell>
                <Badge variant={r.variant}>{r.action}</Badge>
              </TableCell>
            )}
            {show('target') && <TableCell className="text-xs">{r.target}</TableCell>}
            {show('detail') && (
              <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
            )}
          </>
        ),
      }))}
    />
  )
}
