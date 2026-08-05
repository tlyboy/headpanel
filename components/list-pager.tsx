'use client'

import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

// Only provides previous/next page navigation and a position indicator. The list contains operation records in reverse chronological order,
// so there's no point jumping to page 7; this is enough.
export function ListPager({
  page,
  pageCount,
  label,
}: {
  page: number
  pageCount: number
  label: string
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  if (pageCount <= 1) return null

  function go(next: number) {
    const p = new URLSearchParams(params.toString())
    if (next <= 1) p.delete('page')
    else p.set('page', String(next))
    const qs = p.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              text={t('prevPage')}
              aria-label={t('prevPage')}
              aria-disabled={page <= 1}
              className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
              onClick={(e) => {
                e.preventDefault()
                go(page - 1)
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              text={t('nextPage')}
              aria-label={t('nextPage')}
              aria-disabled={page >= pageCount}
              className={
                page >= pageCount ? 'pointer-events-none opacity-50' : ''
              }
              onClick={(e) => {
                e.preventDefault()
                go(page + 1)
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
