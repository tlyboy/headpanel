'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
          placeholder="tag:shengchuang"
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
      {tags.map((tag) => (
        <Label key={tag} className="flex items-center gap-2 font-mono text-sm font-normal">
          <Checkbox
            checked={picked.includes(tag)}
            onCheckedChange={(on) =>
              onChange(on ? [...picked, tag] : picked.filter((x) => x !== tag))
            }
          />
          {tag}
        </Label>
      ))}
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

export function DeleteTag({ tag, disabled }: { tag: string; disabled?: boolean }) {
  const t = useTranslations('tags')
  const { pending, run } = useRun()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending || disabled}
      onClick={() => run(() => deleteTagAction(tag), t('tagDeleted'))}
    >
      {t('delete')}
    </Button>
  )
}

export function DeleteRule({ ruleKey, disabled }: { ruleKey: string; disabled?: boolean }) {
  const t = useTranslations('tags')
  const { pending, run } = useRun()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending || disabled}
      onClick={() => run(() => deleteRuleAction(ruleKey), t('ruleDeleted'))}
    >
      {t('delete')}
    </Button>
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
