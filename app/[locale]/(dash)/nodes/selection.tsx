'use client'

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { tagLabel } from '@/lib/format'
import { bulkTagAction } from './actions'

interface Selection {
  ids: string[]
  picked: Set<string>
  toggle: (id: string, on: boolean) => void
  setAll: (on: boolean) => void
}

const Ctx = createContext<Selection | null>(null)

function useSelection(): Selection {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSelection outside NodeSelection')
  return s
}

// Selection covers the rows currently listed; rows that a new search filters out drop out of it too
export function NodeSelection({
  ids,
  tagOptions,
  children,
}: {
  ids: string[]
  tagOptions: string[]
  children: ReactNode
}) {
  const t = useTranslations('nodes')
  const common = useTranslations('common')
  const [raw, setRaw] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const picked = new Set(ids.filter((id) => raw.has(id)))

  const value: Selection = {
    ids,
    picked,
    toggle: (id, on) => {
      const next = new Set(picked)
      if (on) next.add(id)
      else next.delete(id)
      setRaw(next)
    },
    setAll: (on) => setRaw(on ? new Set(ids) : new Set()),
  }

  function apply(tag: string, mode: 'add' | 'remove') {
    start(async () => {
      const r = await bulkTagAction([...picked], tag, mode)
      if (r.ok) {
        toast.success(
          t(mode === 'add' ? 'bulkAdded' : 'bulkRemoved', {
            count: picked.size,
            tag: tagLabel(tag),
          }),
        )
        setRaw(new Set())
      } else {
        toast.error(r.error ?? common('operationFailed'))
      }
    })
  }

  const menu = (mode: 'add' | 'remove') => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant={mode === 'add' ? 'default' : 'outline'} disabled={pending} />
        }
      >
        {mode === 'add' ? <Plus aria-hidden /> : <Minus aria-hidden />}
        {t(mode === 'add' ? 'bulkAdd' : 'bulkRemove')}
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {tagOptions.map((tag) => (
          <DropdownMenuItem key={tag} onClick={() => apply(tag, mode)}>
            {tagLabel(tag)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <Ctx.Provider value={value}>
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="mr-2 text-sm font-medium">
            {t('bulkPicked', { count: picked.size })}
          </span>
          {menu('add')}
          {menu('remove')}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setRaw(new Set())}>
            <X aria-hidden />
            {t('bulkClear')}
          </Button>
        </div>
      )}
      {children}
    </Ctx.Provider>
  )
}

export function SelectAll() {
  const t = useTranslations('nodes')
  const { ids, picked, setAll } = useSelection()
  const all = ids.length > 0 && picked.size === ids.length
  return (
    <Checkbox
      aria-label={t('selectAll')}
      checked={all}
      indeterminate={picked.size > 0 && !all}
      disabled={ids.length === 0}
      onCheckedChange={(on) => setAll(on)}
    />
  )
}

export function RowSelect({ id, name }: { id: string; name: string }) {
  const t = useTranslations('nodes')
  const { picked, toggle } = useSelection()
  return (
    <Checkbox
      aria-label={t('selectRow', { name })}
      checked={picked.has(id)}
      onCheckedChange={(on) => toggle(id, on)}
    />
  )
}
