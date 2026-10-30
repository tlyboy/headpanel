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
import { TagChecklist } from '@/components/tag-checklist'
import { tagLabel } from '@/lib/format'
import { noAutofill } from '@/lib/no-autofill'
import {
  createRuleAction,
  createTagAction,
  deleteRuleAction,
  deleteTagAction,
  type ActionResult,
} from './actions'

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
  const [mutual, setMutual] = useState(true)

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tagName">{t('tagName')}</Label>
        <Input
          id="tagName"
          {...noAutofill}
          className="w-56 font-mono"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="shengchuang"
        />
      </div>
      <Label className="flex h-9 items-center gap-2 font-normal">
        <Checkbox checked={mutual} onCheckedChange={(on) => setMutual(on)} />
        {t('mutual')}
      </Label>
      <Button
        disabled={pending || !name.trim()}
        onClick={() =>
          run(
            () => createTagAction(name, mutual),
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

function TagPicker({
  label,
  tags,
  picked,
  onChange,
}: {
  label: string
  tags: string[]
  picked: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <TagChecklist options={tags} picked={picked} onChange={onChange} />
    </div>
  )
}

export function RuleForm({ tags }: { tags: string[] }) {
  const t = useTranslations('tags')
  const { pending, run } = useRun()
  const [src, setSrc] = useState<string[]>([])
  const [dst, setDst] = useState<string[]>([])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <TagPicker label={t('from')} tags={tags} picked={src} onChange={setSrc} />
        <TagPicker label={t('to')} tags={tags} picked={dst} onChange={setDst} />
      </div>
      <div>
        <Button
          disabled={pending || !src.length || !dst.length}
          onClick={() =>
            run(
              () => createRuleAction(src, dst),
              t('ruleCreated'),
              () => {
                setSrc([])
                setDst([])
              },
            )
          }
        >
          {t('addRule')}
        </Button>
      </div>
    </div>
  )
}

// Deleting a tag or a rule changes who can reach whom at once, so ask first
function ConfirmDelete({
  title,
  description,
  disabled,
  onConfirm,
}: {
  title: string
  description: string
  disabled?: boolean
  onConfirm: (close: () => void) => void
}) {
  const t = useTranslations('tags')
  const common = useTranslations('common')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {t('delete')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                onConfirm(() => setOpen(false))
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

export function DeleteTag({ tag, disabled }: { tag: string; disabled?: boolean }) {
  const t = useTranslations('tags')
  const { pending, run } = useRun()
  return (
    <ConfirmDelete
      title={t('deleteTagTitle', { tag: tagLabel(tag) })}
      description={t('deleteTagDescription')}
      disabled={pending || disabled}
      onConfirm={(close) => run(() => deleteTagAction(tag), t('tagDeleted'), close)}
    />
  )
}

export function DeleteRule({ ruleKey, summary }: { ruleKey: string; summary: string }) {
  const t = useTranslations('tags')
  const { pending, run } = useRun()
  return (
    <ConfirmDelete
      title={t('deleteRuleTitle')}
      description={t('deleteRuleDescription', { rule: summary })}
      disabled={pending}
      onConfirm={(close) => run(() => deleteRuleAction(ruleKey), t('ruleDeleted'), close)}
    />
  )
}

// Mutual is just the rule "tag → tag"; toggling adds or removes it
export function MutualToggle({
  tag,
  checked,
  selfKey,
  disabled,
}: {
  tag: string
  checked: boolean
  selfKey?: string
  disabled?: boolean
}) {
  const t = useTranslations('tags')
  const { pending, run } = useRun()
  return (
    <Checkbox
      checked={checked}
      disabled={pending || disabled}
      onCheckedChange={(on) =>
        on
          ? run(() => createRuleAction([tag], [tag]), t('mutualOn'))
          : selfKey && run(() => deleteRuleAction(selfKey), t('mutualOff'))
      }
    />
  )
}
