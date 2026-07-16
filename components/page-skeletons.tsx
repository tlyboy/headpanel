import { Skeleton } from '@/components/ui/skeleton'

function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-64 max-w-[70vw]" />
      </div>
      {action ? <Skeleton className="h-9 w-24" /> : null}
    </div>
  )
}

function TableSkeleton({
  columns,
  rows = 6,
}: {
  columns: number
  rows?: number
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div
        className="grid h-10 items-center gap-4 border-b px-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(5rem, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-14" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid h-12 items-center gap-4 border-b px-4 last:border-b-0"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(5rem, 1fr))`,
          }}
        >
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={
                columnIndex === 0
                  ? 'h-4 w-8'
                  : columnIndex === columns - 1
                    ? 'ml-auto h-8 w-8'
                    : 'h-4 w-full max-w-24'
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function TablePageSkeleton({
  columns,
  action = false,
}: {
  columns: number
  action?: boolean
}) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <PageHeaderSkeleton action={action} />
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <TableSkeleton columns={columns} />
        </div>
      </div>
    </div>
  )
}

export function DashboardPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-xl border p-6">
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="mb-5 h-9 w-14" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function NetworkPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <PageHeaderSkeleton />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5 rounded-md border p-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-4 rounded-md border p-4">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </section>
      <TableSkeleton columns={4} rows={4} />
    </div>
  )
}

export function ScriptsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <PageHeaderSkeleton />
      {Array.from({ length: 2 }).map((_, cardIndex) => (
        <div key={cardIndex} className="rounded-xl border p-6">
          <Skeleton className="mb-2 h-6 w-28" />
          <Skeleton className="mb-6 h-4 w-36" />
          <div className="space-y-2">
            {Array.from({ length: cardIndex === 0 ? 3 : 4 }).map(
              (_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48 max-w-[50vw]" />
                    <Skeleton className="h-3 w-60 max-w-[55vw]" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
