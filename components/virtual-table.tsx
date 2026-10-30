'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface VirtualRow {
  key: string
  cells: ReactNode
}

// Pages render the cells on the server; this only keeps the off-screen rows out of the DOM.
// The header sits in its own table above the scrolling body, so it never moves and the scrollbar starts below it.
// A collapsed copy of the header inside the body table sizes the columns; the visible header copies those widths.
export function VirtualTable({
  head,
  rows,
  colSpan,
  empty,
  className,
  footer,
  onEndReached,
}: {
  head: ReactNode
  rows: VirtualRow[]
  colSpan: number
  empty: ReactNode
  className?: string
  // Shown under the last row, e.g. a loading or "all loaded" line
  footer?: ReactNode
  // Called when the rendered window gets near the last row, to load the next batch
  onEndReached?: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const headBox = useRef<HTMLDivElement>(null)
  const bodyTable = useRef<HTMLTableElement>(null)
  const ghost = useRef<HTMLTableRowElement>(null)
  const [layout, setLayout] = useState<{ widths: number[]; total: number } | null>(null)

  useLayoutEffect(() => {
    const table = bodyTable.current
    const row = ghost.current
    if (!table || !row) return
    const measure = () =>
      setLayout({
        widths: [...row.children].map((c) => c.getBoundingClientRect().width),
        total: table.getBoundingClientRect().width,
      })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(table)
    return () => ro.disconnect()
  }, [])

  // The compiler already skips this component; nothing here is passed to memoized children
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 45,
    overscan: 10,
    getItemKey: (i) => rows[i].key,
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)
  const lastIndex = items.at(-1)?.index ?? -1

  useEffect(() => {
    if (onEndReached && rows.length > 0 && lastIndex >= rows.length - 20) onEndReached()
  }, [lastIndex, rows.length, onEndReached])

  return (
    <div
      className={cn(
        'flex max-h-[calc(100svh-10rem)] flex-col overflow-hidden rounded-md border',
        className,
      )}
    >
      <div ref={headBox} className="shrink-0 [scrollbar-gutter:stable] overflow-hidden border-b">
        <table
          className="text-sm"
          style={layout ? { tableLayout: 'fixed', width: layout.total } : { width: '100%' }}
        >
          {layout && (
            <colgroup>
              {layout.widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>{head}</tr>
          </thead>
        </table>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          if (headBox.current) headBox.current.scrollLeft = e.currentTarget.scrollLeft
        }}
        className="min-h-0 shrink [scrollbar-gutter:stable] overflow-auto"
      >
        <table ref={bodyTable} className="w-full text-sm">
          <thead aria-hidden className="[visibility:collapse]">
            <tr ref={ghost} inert>
              {head}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
            {padTop > 0 && (
              <tr aria-hidden>
                <td colSpan={colSpan} style={{ height: padTop, padding: 0 }} />
              </tr>
            )}
            {items.map((item) => (
              <TableRow key={item.key} data-index={item.index} ref={virtualizer.measureElement}>
                {rows[item.index].cells}
              </TableRow>
            ))}
            {padBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={colSpan} style={{ height: padBottom, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
        {footer}
      </div>
    </div>
  )
}
