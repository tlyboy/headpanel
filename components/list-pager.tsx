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

// 共 N 条 · 每页条数 · 上一页/页码/下一页 · 跳页，整条右对齐。
// 页码只显示当前页而不铺开一排：审计是按时间倒序的流水，
// 「第 7 页」本身没有含义，能翻能跳就够了。
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
    // 每页条数一变，原来的页码多半越界了，直接回第一页
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

      <Select value={String(perPage)} onValueChange={setPerPage}>
        <SelectTrigger className="h-7 w-28">
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
          size="icon-xs"
          aria-label={t('prevPage')}
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-8 rounded-md border px-2 py-0.5 text-center tabular-nums">
          {page}
        </span>
        <Button
          variant="outline"
          size="icon-xs"
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
          // 不受控：页码的真相在 URL 上，这里只是个一次性的输入口
          key={page}
          defaultValue={page}
          inputMode="numeric"
          className="h-7 w-14 text-center"
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
