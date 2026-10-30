'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
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

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tagName">{t('tagName')}</Label>
        <Input
          id="tagName"
          {...noAutofill}
          className="w-56"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="shengchuang"
        />
      </div>
      <Button
        disabled={pending || !name.trim()}
        onClick={() =>
          run(
            () => createTagAction(name),
            t('tagCreated'),
            () => setName(''),
          )
        }
      >
        {t('addTag')}
      </Button>
    </div>
  )
}

export interface MemberOption {
  id: string
  name: string
  ip: string
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
  const shown = nodes.filter((n) => !q || n.name.toLowerCase().includes(q) || n.ip.includes(q))

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
        {t('editMembers')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('membersTitle', { tag: tagLabel(tag) })}</DialogTitle>
            <DialogDescription>{t('membersDescription')}</DialogDescription>
          </DialogHeader>
          <Input
            {...noAutofill}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchDevices')}
          />
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {shown.map((n) => {
              const on = picked.includes(n.id)
              // headscale can't take the last tag off a node
              const locked = on && n.tags.length === 1 && n.tags[0] === tag
              return (
                <Label key={n.id} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={on}
                    disabled={locked}
                    onCheckedChange={(v) =>
                      setPicked(v ? [...picked, n.id] : picked.filter((x) => x !== n.id))
                    }
                  />
                  <span>{n.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{n.ip}</span>
                  {locked && <span className="text-xs text-muted-foreground">{t('onlyTag')}</span>}
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
        size="sm"
        disabled={pending || disabled}
        onClick={() => setOpen(true)}
      >
        {t('delete')}
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
