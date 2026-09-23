'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PER_PAGE_OPTIONS } from '@/components/pager'

// N total · rows per page · previous/page number/next · jump to page, all right-aligned.
// Show only the current page number instead of a row of page numbers: the audit log is a time-descending stream,
// and "page 7" has no meaning on its own. Being able to flip through or jump to a page is enough.
export function ListPager({
  page,
  pageCount,
  total,
  perPage,
}: {
  page: number
  pageCount: number
  total: number
  perPage: number
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const jumpRef = useRef<HTMLInputElement>(null)

  function push(next: URLSearchParams) {
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  function go(next: number) {
    const target = Math.min(Math.max(1, next), pageCount)
    const p = new URLSearchParams(params.toString())
    if (target <= 1) p.delete('page')
    else p.set('page', String(target))
    push(p)
  }

  function setPerPage(v: string) {
    const p = new URLSearchParams(params.toString())
    if (Number(v) === PER_PAGE_OPTIONS[0]) p.delete('per')
    else p.set('per', v)
    // When the rows per page change, the current page number will likely be out of range, so go straight back to the first page.
    p.delete('page')
    push(p)
  }

  function jump() {
    const raw = jumpRef.current?.value.trim()
    const n = Number(raw)
    if (!raw || !Number.isFinite(n)) return
    go(Math.trunc(n))
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span className="text-muted-foreground">
        {t('totalItems', { total })}
      </span>

      <Select
        items={PER_PAGE_OPTIONS.map((n) => ({
          value: String(n),
          label: t('perPage', { count: n }),
        }))}
        value={String(perPage)}
        onValueChange={(v) => v && setPerPage(v)}
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PER_PAGE_OPTIONS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {t('perPage', { count: n })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('prevPage')}
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="flex h-8 min-w-8 items-center justify-center rounded-md border px-2 tabular-nums">
          {page}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('nextPage')}
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <span className="flex items-center gap-1.5 text-muted-foreground">
        {t('goTo')}
        <Input
          ref={jumpRef}
          // Uncontrolled: the URL is the source of truth for the page number; this is just a one-time input field.
          key={page}
          defaultValue={page}
          inputMode="numeric"
          className="w-14 text-center"
          onKeyDown={(e) => {
            if (e.key === 'Enter') jump()
          }}
          onBlur={jump}
        />
        {t('pageUnit')}
      </span>
    </div>
  )
}
