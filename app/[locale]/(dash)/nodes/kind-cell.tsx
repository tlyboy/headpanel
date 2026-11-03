'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { DeviceKindIcon } from '@/components/device-kind-icon'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { DEVICE_KINDS, isDeviceKind, type DeviceKind, type ResolvedKind } from '@/lib/device-kind'
import { cn } from '@/lib/utils'
import { setDeviceKindAction } from './actions'
import { useSelection } from './selection'

const AUTO = 'auto'

export function KindCell({
  id,
  manual,
  inferred,
}: {
  id: string
  manual: DeviceKind | null
  inferred: ResolvedKind
}) {
  const t = useTranslations('nodes')
  const kinds = useTranslations('deviceKinds')
  const common = useTranslations('common')
  const { picked } = useSelection()
  const [pending, start] = useTransition()

  const shown = manual ?? inferred
  const targets = picked.has(id) && picked.size > 1 ? [...picked] : [id]

  function change(value: string | null) {
    if (value === null) return
    const next = isDeviceKind(value) ? value : null
    start(async () => {
      const result = await setDeviceKindAction(targets, next)
      if (!result.ok) toast.error(result.error ?? common('operationFailed'))
      else if (targets.length > 1) toast.success(t('kindBulkDone', { count: targets.length }))
    })
  }

  return (
    <Select value={manual ?? AUTO} onValueChange={change} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label={t('kind')}
        title={manual ? undefined : t('kindAutoHint')}
        className={cn(
          'w-full border-transparent bg-transparent shadow-none dark:bg-transparent',
          !manual && 'text-muted-foreground',
        )}
      >
        <DeviceKindIcon kind={shown} className="size-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">{kinds(shown)}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>
          <DeviceKindIcon kind={inferred} className="size-3.5" />
          {t('kindAuto', { kind: kinds(inferred) })}
        </SelectItem>
        {DEVICE_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            <DeviceKindIcon kind={kind} className="size-3.5" />
            {kinds(kind)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
