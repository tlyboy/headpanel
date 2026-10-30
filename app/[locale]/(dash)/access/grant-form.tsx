'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { noAutofill } from '@/lib/no-autofill'
import { createGrantAction, type EndpointInput } from './actions'

interface Option {
  value: string
  label: string
}

const KINDS = ['zone', 'group', 'node'] as const
type Kind = (typeof KINDS)[number]

const EMPTY: EndpointInput = { kind: 'zone', ref: null }

function EndpointPicker({
  id,
  label,
  value,
  onChange,
  groups,
  nodes,
}: {
  id: string
  label: string
  value: EndpointInput
  onChange: (v: EndpointInput) => void
  groups: Option[]
  nodes: Option[]
}) {
  const t = useTranslations('grantForm')
  const kindItems = KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))
  const refItems = value.kind === 'group' ? groups : nodes

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Select
          items={kindItems}
          value={value.kind}
          onValueChange={(v) => v && onChange({ kind: v as Kind, ref: null })}
        >
          <SelectTrigger id={id} className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kindItems.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value.kind !== 'zone' && (
          <Select
            items={refItems}
            value={value.ref}
            onValueChange={(v) => v && onChange({ kind: value.kind, ref: v })}
          >
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue
                placeholder={value.kind === 'group' ? t('selectGroup') : t('selectNode')}
              />
            </SelectTrigger>
            <SelectContent>
              {refItems.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}

export function CreateGrant({ groups, nodes }: { groups: Option[]; nodes: Option[] }) {
  const t = useTranslations('grantForm')
  const common = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [src, setSrc] = useState<EndpointInput>(EMPTY)
  const [dst, setDst] = useState<EndpointInput>(EMPTY)
  const [ports, setPorts] = useState('*')
  const [note, setNote] = useState('')

  function reset() {
    setSrc(EMPTY)
    setDst(EMPTY)
    setPorts('*')
    setNote('')
  }

  const incomplete = [src, dst].some((e) => e.kind !== 'zone' && !e.ref) || !ports.trim()

  function submit() {
    start(async () => {
      const r = await createGrantAction({ src, dst, ports, note })
      if (r.ok) {
        toast.success(t('created'))
        setOpen(false)
        reset()
        router.refresh()
      } else {
        toast.error(r.error ?? t('createFailed'))
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger render={<Button />}>{t('trigger')}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <EndpointPicker
            id="grant-src"
            label={t('source')}
            value={src}
            onChange={setSrc}
            groups={groups}
            nodes={nodes}
          />
          <EndpointPicker
            id="grant-dst"
            label={t('destination')}
            value={dst}
            onChange={setDst}
            groups={groups}
            nodes={nodes}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-ports">{t('ports')}</Label>
            <Input
              id="grant-ports"
              {...noAutofill}
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              placeholder="*"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">{t('portsHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-note">{t('note')}</Label>
            <Input
              id="grant-note"
              {...noAutofill}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('notePlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {common('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || incomplete}>
            {pending ? t('creating') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
