'use client'

import { useCallback, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SlidersHorizontal } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  COLUMN_COOKIE_MAX_AGE,
  columnCookieName,
  serializeHidden,
  type ColumnDef,
} from '@/components/columns'

export function ColumnFilter({
  page,
  columns,
  hidden: initialHidden,
}: {
  /** Suffix for the cookie name, one per list page */
  page: string
  columns: ColumnDef[]
  /** Hidden columns read on the server, used as the initial value */
  hidden: string[]
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  // Update locally first so the checkbox responds immediately; both sides will match after the server re-renders
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden))

  const toggleable = columns.filter((c) => !c.locked)
  const visibleCount = toggleable.filter((c) => !hidden.has(c.key)).length

  // Use the same pattern as writing sidebar_state in ui/sidebar.tsx: wrap it in useCallback,
  // otherwise React Compiler's immutability rule will block assigning to document.cookie
  const toggle = useCallback(
    (key: string, next: boolean) => {
      setHidden((prev) => {
        const draft = new Set(prev)
        if (next) draft.delete(key)
        else draft.add(key)
        document.cookie = `${columnCookieName(page)}=${serializeHidden(draft)}; path=/; max-age=${COLUMN_COOKIE_MAX_AGE}; samesite=lax`
        return draft
      })
      // The table is rendered on the server, so after changing the cookie, RSC must run again for columns to actually be added or removed
      start(() => router.refresh())
    },
    [page, router],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <SlidersHorizontal />
          {t('columns')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {toggleable.map((c) => {
          const checked = !hidden.has(c.key)
          return (
            <DropdownMenuCheckboxItem
              key={c.key}
              checked={checked}
              // Hiding everything would leave an empty table, so don't allow unchecking the last column
              disabled={checked && visibleCount <= 1}
              onCheckedChange={(v) => toggle(c.key, v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
