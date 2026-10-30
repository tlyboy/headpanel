'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { tagLabel } from '@/lib/format'
import { noAutofill } from '@/lib/no-autofill'
import { createTagAction, deleteTagAction, setMembersAction, type ActionResult } from './actions'

function useRun() {
  const common = useTranslations('common')
  const [pending, start] = useTransition()
  function run(p: () => Promise<ActionResult>, okMsg: string, onOk?: () => void) {
    start(async () => {
      const r = await p()
      if (r.ok) {
        toast.success(okMsg)
        onOk?.()
      } else {
        toast.error(r.error ?? common('operationFailed'))
      }
    })
  }
  return { pending, run }
}

export function TagForm() {
  const t = useTranslations('tags')
  const { pending, run } = useRun()
  const [name, setName] = useState('')
  const submit = () =>
    run(
      () => createTagAction(name),
      t('tagCreated'),
      () => setName(''),
    )

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) submit()
      }}
    >
      <Input
        {...noAutofill}
        aria-label={t('tagName')}
        className="w-56"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('tagNamePlaceholder')}
      />
      <Button type="submit" disabled={pending || !name.trim()}>
        <Plus aria-hidden />
        {t('addTag')}
      </Button>
    </form>
  )
}

export interface MemberOption {
  id: string
  name: string
  ip: string
  online: boolean
  tags: string[]
}

export function EditMembers({ tag, nodes }: { tag: string; nodes: MemberOption[] }) {
  const t = useTranslations('tags')
  const common = useTranslations('common')
  const { pending, run } = useRun()
  const current = () => nodes.filter((n) => n.tags.includes(tag)).map((n) => n.id)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>(current)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // Current members first, so you see who is in before scrolling through everyone else
  const ordered = nodes.toSorted(
    (a, b) => Number(b.tags.includes(tag)) - Number(a.tags.includes(tag)),
  )
  const shown = ordered.filter((n) => !q || n.name.toLowerCase().includes(q) || n.ip.includes(q))
  // headscale can't take the last tag off a node
  const locked = (n: MemberOption) => n.tags.length === 1 && n.tags[0] === tag
  const pickedSet = new Set(picked)
  const allShownPicked = shown.length > 0 && shown.every((n) => pickedSet.has(n.id))

  // Both act on what the search shows, so "search, then select all" picks a subset
  const selectAll = () => setPicked([...new Set([...picked, ...shown.map((n) => n.id)])])
  const clearAll = () => {
    const drop = new Set(shown.filter((n) => !locked(n)).map((n) => n.id))
    setPicked(picked.filter((id) => !drop.has(id)))
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setPicked(current())
          setQuery('')
          setOpen(true)
        }}
      >
        <Users aria-hidden />
        {t('editMembers')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('membersTitle', { tag: tagLabel(tag) })}</DialogTitle>
            <DialogDescription>{t('membersDescription')}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              {...noAutofill}
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchDevices')}
              aria-label={t('searchDevices')}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t('pickedCount', { picked: picked.length, total: nodes.length })}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={selectAll} disabled={allShownPicked}>
                {q ? t('selectShown') : t('selectAll')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={!shown.some((n) => pickedSet.has(n.id) && !locked(n))}
              >
                {t('clearAll')}
              </Button>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('noMatch')}</p>
            )}
            {shown.map((n) => {
              const on = pickedSet.has(n.id)
              const lock = on && locked(n)
              return (
                <Label
                  key={n.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 border-b px-3 py-2 font-normal last:border-b-0 hover:bg-muted/50 has-disabled:cursor-not-allowed"
                >
                  <Checkbox
                    checked={on}
                    disabled={lock}
                    onCheckedChange={(v) =>
                      setPicked(v ? [...picked, n.id] : picked.filter((x) => x !== n.id))
                    }
                  />
                  <span
                    className={`size-2 shrink-0 rounded-full ${n.online ? 'bg-success' : 'bg-muted-foreground/40'}`}
                    aria-label={n.online ? t('online') : t('offline')}
                  />
                  <span className="min-w-0 flex-1 truncate">{n.name}</span>
                  {lock ? (
                    <span className="text-xs text-muted-foreground">{t('onlyTag')}</span>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">{n.ip}</span>
                  )}
                </Label>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {common('cancel')}
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => setMembersAction(tag, picked),
                  t('membersSaved'),
                  () => setOpen(false),
                )
              }
            >
              {pending ? common('saving') : common('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DeleteTag({ tag, disabled }: { tag: string; disabled?: boolean }) {
  const t = useTranslations('tags')
  const common = useTranslations('common')
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        disabled={pending || disabled}
        onClick={() => setOpen(true)}
        aria-label={t('deleteTagTitle', { tag: tagLabel(tag) })}
        title={disabled ? t('deleteDisabled') : t('delete')}
      >
        <Trash2 aria-hidden />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTagTitle', { tag: tagLabel(tag) })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteTagDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                run(
                  () => deleteTagAction(tag),
                  t('tagDeleted'),
                  () => setOpen(false),
                )
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
