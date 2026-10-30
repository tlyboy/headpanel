'use client'

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, Minus, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { tagLabel } from '@/lib/format'
import { noAutofill } from '@/lib/no-autofill'
import { cn } from '@/lib/utils'
import { bulkTagAction, createTagAction, deleteTagAction } from './actions'

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

interface Selection {
  ids: string[]
  picked: Set<string>
  toggle: (id: string, on: boolean) => void
  setAll: (on: boolean) => void
  tagsById: Record<string, string[]>
  tagCounts: Record<string, number>
  defaultTag: string
}

const Ctx = createContext<Selection | null>(null)

function useSelection(): Selection {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSelection outside NodeSelection')
  return s
}

// Selection covers the rows currently listed; rows that a new search filters out drop out of it too
export function NodeSelection({
  tagsById,
  tagCounts,
  defaultTag,
  children,
}: {
  tagsById: Record<string, string[]>
  tagCounts: Record<string, number>
  defaultTag: string
  children: ReactNode
}) {
  const ids = Object.keys(tagsById)
  const [raw, setRaw] = useState<Set<string>>(new Set())
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
    tagsById,
    tagCounts,
    defaultTag,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
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

// Click a row's tags to edit them. If that row is part of a multi-row selection, the edit applies to every selected row.
export function TagCell({ id }: { id: string }) {
  const t = useTranslations('nodes')
  const common = useTranslations('common')
  const { picked, tagsById, tagCounts, defaultTag } = useSelection()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, start] = useTransition()

  const own = tagsById[id] ?? []
  const targets = picked.has(id) && picked.size > 1 ? [...picked] : [id]
  const bulk = targets.length > 1
  const all = Object.keys(tagCounts).sort()
  const q = query.trim().toLowerCase().replace(/^tag:/, '')
  const shown = all.filter((tag) => tagLabel(tag).includes(q))
  const canCreate = NAME_RE.test(q) && !all.includes(`tag:${q}`)

  const holders = (tag: string) => targets.filter((x) => tagsById[x]?.includes(tag)).length
  // headscale can't take the last tag off a node
  const stuck = (tag: string) =>
    targets.some((x) => tagsById[x]?.length === 1 && tagsById[x][0] === tag)

  function report(r: { ok: boolean; error?: string }, ok?: string) {
    if (!r.ok) toast.error(r.error ?? common('operationFailed'))
    else if (ok) toast.success(ok)
  }

  function toggleTag(tag: string) {
    const remove = holders(tag) === targets.length
    if (remove && stuck(tag)) return
    start(async () => report(await bulkTagAction(targets, tag, remove ? 'remove' : 'add')))
  }

  function create() {
    start(async () => {
      const r = await createTagAction(q)
      if (r.ok && r.tag) {
        setQuery('')
        report(await bulkTagAction(targets, r.tag, 'add'), t('tagCreated', { tag: q }))
      } else report(r)
    })
  }

  function remove(tag: string) {
    start(async () => report(await deleteTagAction(tag), t('tagDeleted', { tag: tagLabel(tag) })))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <PopoverTrigger
        className={cn(
          'flex min-h-8 w-full min-w-24 flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left',
          'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          open && 'bg-muted',
        )}
        aria-label={t('editTags')}
      >
        {own.length ? (
          own.map((tag) => (
            <Badge key={tag} variant="outline">
              {tagLabel(tag)}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        <div className="border-b p-2">
          <Input
            {...noAutofill}
            autoFocus
            className="h-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || pending) return
              e.preventDefault()
              if (canCreate) create()
              else if (shown.length === 1) toggleTag(shown[0])
            }}
            placeholder={t('tagSearch')}
            aria-label={t('tagSearch')}
          />
          {bulk && (
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              {t('tagBulkHint', { count: targets.length })}
            </p>
          )}
        </div>
        <ul className="max-h-64 overflow-y-auto p-1" aria-busy={pending}>
          {shown.map((tag) => {
            const n = holders(tag)
            const state = n === targets.length ? 'all' : n > 0 ? 'some' : 'none'
            const locked = state === 'all' && stuck(tag)
            const deletable = (tagCounts[tag] ?? 0) === 0 && tag !== defaultTag
            return (
              <li key={tag} className="group flex items-center">
                <button
                  type="button"
                  disabled={pending || locked}
                  onClick={() => toggleTag(tag)}
                  title={locked ? t('tagOnlyOne') : undefined}
                  className="flex h-9 flex-1 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                      state !== 'none' && 'border-primary bg-primary text-primary-foreground',
                    )}
                    aria-hidden
                  >
                    {state === 'all' && <Check className="size-3" />}
                    {state === 'some' && <Minus className="size-3" />}
                  </span>
                  <span className="flex-1 truncate">{tagLabel(tag)}</span>
                  {tag === defaultTag && (
                    <span className="text-xs text-muted-foreground">{t('tagDefault')}</span>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {tagCounts[tag] ?? 0}
                  </span>
                </button>
                {deletable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(tag)}
                    aria-label={t('tagDelete', { tag: tagLabel(tag) })}
                    className="flex size-9 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            )
          })}
          {canCreate && (
            <li>
              <button
                type="button"
                disabled={pending}
                onClick={create}
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-muted"
              >
                <Plus className="size-4" aria-hidden />
                {t('tagCreate', { tag: q })}
              </button>
            </li>
          )}
          {!shown.length && !canCreate && (
            <li className="px-2 py-3 text-center text-sm text-muted-foreground">
              {t('tagNoMatch')}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
