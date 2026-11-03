'use client'

import { useState, useTransition } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { noAutofill } from '@/lib/no-autofill'
import { useResetOnHide } from '@/lib/use-reset-on-hide'
import { cn } from '@/lib/utils'
import { setDeviceLocationAction } from './actions'
import { useSelection } from './selection'

const OPTION_CLASS =
  'flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-muted disabled:opacity-50'

export function LocationCell({
  id,
  location,
  options,
}: {
  id: string
  location: string | null
  options: string[]
}) {
  const t = useTranslations('nodes')
  const common = useTranslations('common')
  const { picked } = useSelection()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, start] = useTransition()
  useResetOnHide(() => {
    setOpen(false)
    setQuery('')
  })

  const targets = picked.has(id) && picked.size > 1 ? [...picked] : [id]
  const q = query.trim()
  const shown = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()))
  const canCreate = q.length > 0 && !options.includes(q)

  function save(next: string | null) {
    start(async () => {
      const result = await setDeviceLocationAction(targets, next)
      if (!result.ok) {
        toast.error(result.error ?? common('operationFailed'))
        return
      }
      if (targets.length > 1) toast.success(t('locationBulkDone', { count: targets.length }))
      setOpen(false)
      setQuery('')
    })
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
          'flex min-h-8 w-full items-center rounded-md px-1.5 py-1 text-left text-sm',
          'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          open && 'bg-muted',
        )}
        aria-label={t('location')}
      >
        <span className={cn('truncate', !location && 'text-muted-foreground')}>
          {location ?? '—'}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-0 p-0">
        <div className="border-b p-2">
          <Input
            {...noAutofill}
            autoFocus
            className="h-8"
            maxLength={40}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || pending || !q) return
              e.preventDefault()
              save(q)
            }}
            placeholder={t('locationSearch')}
            aria-label={t('locationSearch')}
          />
          {targets.length > 1 && (
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              {t('tagBulkHint', { count: targets.length })}
            </p>
          )}
        </div>
        <ul className="max-h-64 overflow-y-auto p-1" aria-busy={pending}>
          {shown.map((option) => (
            <li key={option}>
              <button
                type="button"
                disabled={pending}
                className={OPTION_CLASS}
                onClick={() => save(option)}
              >
                <Check
                  aria-hidden
                  className={cn('size-3.5 shrink-0', option !== location && 'invisible')}
                />
                <span className="truncate">{option}</span>
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                disabled={pending}
                className={OPTION_CLASS}
                onClick={() => save(q)}
              >
                <Plus aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{t('locationCreate', { location: q })}</span>
              </button>
            </li>
          )}
          {location && (
            <li>
              <button
                type="button"
                disabled={pending}
                className={cn(OPTION_CLASS, 'text-muted-foreground')}
                onClick={() => save(null)}
              >
                <X aria-hidden className="size-3.5 shrink-0" />
                {t('locationClear')}
              </button>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
