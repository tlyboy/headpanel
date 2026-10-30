'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { tagLabel } from '@/lib/format'
import { noAutofill } from '@/lib/no-autofill'
import { createTagAction, deleteTagAction, type ActionResult } from './actions'

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
