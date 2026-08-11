'use client'

import { useRef, useTransition, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RotateCcw, Search } from 'lucide-react'
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

export interface FilterSelect {
  /** URL parameter name */
  name: string
  /** Placeholder shown when nothing is selected */
  placeholder: string
  /** An empty string for value means "All" */
  options: { value: string; label: string }[]
}

// The single toolbar at the top of each list page: filters and actions on the left, column visibility on the right.
// Filter state lives in the URL, not in the component: pages are all RSC + force-dynamic, and filtering happens on the server,
// giving us shareable links and working back/forward navigation for free.
// If placeholder is omitted, the search area isn't rendered (those pages have nothing to filter),
// but the toolbar remains for action buttons and column filters — all six list pages look the same.
export function ListFilters({
  placeholder,
  selects = [],
  actions,
  columns,
}: {
  placeholder?: string
  selects?: FilterSelect[]
  /** Page-level action buttons, with Add first */
  actions?: ReactNode
  /** Column filter dropdown on the right */
  columns?: ReactNode
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  // The input is uncontrolled: the URL is the single source of truth. The key changes with the URL's q,
  // so back/forward navigation remounts the component and defaultValue naturally returns to the right value.
  const urlQ = params.get('q') ?? ''
  const searchable = placeholder != null

  function push(next: URLSearchParams) {
    // Any filter change should return to the first page; otherwise, you'll end up on a page number that no longer exists
    next.delete('page')
    const qs = next.toString()
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname))
  }

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(name, value)
    else next.delete(name)
    push(next)
  }

  function submitSearch() {
    const v = inputRef.current?.value.trim() ?? ''
    if (v !== urlQ) setParam('q', v)
  }

  return (
    <div className="flex items-start justify-between gap-2">
      {/* The left group wraps on its own, while the column filter stays pinned to the right — otherwise, on narrow screens it wraps to the far left of the next row */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {searchable && (
          <>
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault()
                submitSearch()
              }}
            >
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                key={urlQ}
                ref={inputRef}
                name="q"
                defaultValue={urlQ}
                // Filter on blur: the button just provides an explicit option, without affecting people who prefer Enter or simply click away
                onBlur={submitSearch}
                placeholder={placeholder}
                className="w-56 pl-8"
              />
            </form>

            {selects.map((s) => (
              <Select
                key={s.name}
                // When unfiltered, pass undefined instead of __all: Radix only shows the placeholder when
                // no value is selected; always passing a sentinel value leaves the trigger completely blank.
                value={params.get(s.name) ?? undefined}
                onValueChange={(v) => setParam(s.name, v === '__all' ? '' : v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={s.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">{s.placeholder}</SelectItem>
                  {s.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}

            <Button size="sm" disabled={pending} onClick={submitSearch}>
              <Search />
              {t('search')}
            </Button>
            {/* Always visible and clickable: making it appear and disappear would cause the buttons after it to jump left and right, while a disabled button
                still makes people wonder "Can I click this right now?" — with no filter, just click it to return to the default state */}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => start(() => router.replace(pathname))}
            >
              <RotateCcw />
              {t('reset')}
            </Button>
          </>
        )}

        {actions}
      </div>

      {columns}
    </div>
  )
}
