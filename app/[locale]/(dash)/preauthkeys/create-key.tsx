'use client'

import { useState, useTransition } from 'react'
import { Copy, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useCopy } from '@/lib/use-copy'
import { createKeyAction, type AccessMode } from './actions'

const DAY_OPTIONS = [
  { labelKey: 'oneDay', value: 1 },
  { labelKey: 'sevenDays', value: 7 },
  { labelKey: 'thirtyDays', value: 30 },
  { labelKey: 'ninetyDays', value: 90 },
  { labelKey: 'permanent', value: 36500 },
] as const

export function CreateKey({
  groups,
}: {
  groups: { id: number; name: string }[]
}) {
  const t = useTranslations('createKey')
  const common = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [groupId, setGroupId] = useState<number | null>(null)
  const [reusable, setReusable] = useState(true)
  const [ephemeral, setEphemeral] = useState(false)
  const [days, setDays] = useState(30)
  const [mode, setMode] = useState<AccessMode>('review')
  const [result, setResult] = useState<string | null>(null)
  const { copied, copy } = useCopy()

  function submit() {
    if (groupId == null) {
      toast.error(t('selectGroupRequired'))
      return
    }
    start(async () => {
      const r = await createKeyAction({ groupId, reusable, ephemeral, days, mode })
      if (r.ok && r.key) {
        setResult(r.key)
        toast.success(t('generated'))
      } else {
        toast.error(r.error ?? t('generateFailed'))
      }
    })
  }

  function close(o: boolean) {
    setOpen(o)
    if (!o) {
      setResult(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button>{t('trigger')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label>{t('resultLabel')}</Label>
            <div className="flex min-w-0 items-center gap-2">
              <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 font-mono text-xs">
                {result}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={() => copy(result)}
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="group">{t('group')}</Label>
                <Select
                  value={groupId == null ? '' : String(groupId)}
                  onValueChange={(v) => setGroupId(Number(v))}
                >
                  <SelectTrigger id="group">
                    <SelectValue placeholder={t('selectGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noGroups')}</p>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="reusable"
                checked={reusable}
                onCheckedChange={(v) => setReusable(v === true)}
              />
              <Label htmlFor="reusable" className="font-normal">
                {t('reusable')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ephemeral"
                checked={ephemeral}
                onCheckedChange={(v) => setEphemeral(v === true)}
              />
              <Label htmlFor="ephemeral" className="font-normal">
                {t('ephemeral')}
              </Label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mode">{t('mode')}</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as AccessMode)}
              >
                <SelectTrigger id="mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">
                    {t('reviewMode')}
                  </SelectItem>
                  <SelectItem value="direct">
                    {t('directMode')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="days">{t('expiration')}</Label>
              <Select
                value={String(days)}
                onValueChange={(v) => setDays(Number(v))}
              >
                <SelectTrigger id="days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {t(o.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => close(false)}>{t('done')}</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => close(false)}
                disabled={pending}
              >
                {common('cancel')}
              </Button>
              <Button onClick={submit} disabled={pending || groupId == null}>
                {pending ? t('generating') : t('generate')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
