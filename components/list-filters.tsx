'use client'

import { useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
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

// Keep filter state in the URL instead of the component: the pages are all RSC + force-dynamic, and filtering happens on the server,
// which also gives us shareable links and working back/forward navigation for free.
export function ListFilters({
  placeholder,
  selects = [],
  clearLabel,
}: {
  placeholder: string
  selects?: FilterSelect[]
  clearLabel: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  // The input is uncontrolled: the URL is the single source of truth. The key changes with the URL's q,
  // so back/forward navigation remounts the component and defaultValue naturally returns to the right value.
  const urlQ = params.get('q') ?? ''

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

  const active = urlQ !== '' || selects.some((s) => params.get(s.name))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          const v = new FormData(e.currentTarget).get('q')
          setParam('q', String(v ?? '').trim())
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          key={urlQ}
          name="q"
          defaultValue={urlQ}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v !== urlQ) setParam('q', v)
          }}
          placeholder={placeholder}
          className="w-56 pl-8"
        />
      </form>

      {selects.map((s) => (
        <Select
          key={s.name}
          value={params.get(s.name) ?? '__all'}
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

      {active && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => start(() => router.replace(pathname))}
        >
          <X />
          {clearLabel}
        </Button>
      )}
    </div>
  )
}
