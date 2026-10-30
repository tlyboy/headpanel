import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors ListFilters: search box, dropdowns, search + reset, an optional page action, and the column picker on the right
function ToolbarSkeleton({ selects = 0, action = false }: { selects?: number; action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: selects }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-40" />
        ))}
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        {action && <Skeleton className="h-8 w-24" />}
      </div>
      <Skeleton className="h-8 w-14" />
    </div>
  )
}

// Mirrors VirtualTable: a fixed header row over body rows, with the optional select and ⋯ columns at the ends
function TableSkeleton({
  columns,
  rows,
  select,
  actions,
}: {
  columns: number
  rows: number
  select?: boolean
  actions?: boolean
}) {
  const line = (cell: (i: number) => ReactNode, className: string, key?: number) => (
    <div key={key} className={className}>
      {select && <Skeleton className="size-4 shrink-0" />}
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="min-w-0 flex-1">
          {cell(i)}
        </div>
      ))}
      {actions && <Skeleton className="mx-3 size-5 shrink-0" />}
    </div>
  )
  return (
    <div className="overflow-hidden rounded-md border">
      {line(
        () => (
          <Skeleton className="h-3 w-12" />
        ),
        'flex h-10 items-center gap-4 border-b px-3',
      )}
      {Array.from({ length: rows }).map((_, r) =>
        line(
          (i) => <Skeleton className={i === 0 ? 'h-4 w-3/4' : 'h-3.5 w-2/3 max-w-32'} />,
          'flex h-11 items-center gap-4 border-b px-3 last:border-b-0',
          r,
        ),
      )}
    </div>
  )
}

// A collapsed Fold card under the table
function FoldSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border px-6 py-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-48" />
    </div>
  )
}

export function TablePageSkeleton({
  columns,
  rows = 10,
  selects,
  action,
  select,
  actions = true,
  fold,
}: {
  /** Data columns, not counting the select and ⋯ columns */
  columns: number
  rows?: number
  /** Dropdown filters next to the search box */
  selects?: number
  /** A page-level button in the toolbar, such as Generate key */
  action?: boolean
  /** A checkbox column on the left */
  select?: boolean
  /** A ⋯ menu column on the right */
  actions?: boolean
  /** A collapsed help card under the table */
  fold?: boolean
}) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <ToolbarSkeleton selects={selects} action={action} />
      <TableSkeleton columns={columns} rows={rows} select={select} actions={actions} />
      {fold && <FoldSkeleton />}
    </div>
  )
}

export function DashboardPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border p-6">
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="mb-5 h-9 w-14" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="flex min-h-72 flex-1 flex-col gap-4 rounded-xl border p-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="flex-1" />
      </div>
    </div>
  )
}

export function NetworkPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4 rounded-md border p-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full max-w-md" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
        <div className="space-y-4 rounded-md border p-4">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
