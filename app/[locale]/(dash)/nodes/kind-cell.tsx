'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { DeviceKindIcon } from '@/components/device-kind-icon'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { DEVICE_KINDS, isDeviceKind, type DeviceKind } from '@/lib/device-kind'
import { cn } from '@/lib/utils'
import { setDeviceKindAction } from './actions'
import { useSelection } from './selection'

const UNSET = 'unset'

export function KindCell({
  id,
  kind,
  system,
}: {
  id: string
  kind: DeviceKind | null
  /** What the client reports, shown only as a hint for whoever picks the kind. */
  system?: string
}) {
  const t = useTranslations('nodes')
  const kinds = useTranslations('deviceKinds')
  const common = useTranslations('common')
  const { picked } = useSelection()
  const [pending, start] = useTransition()
  const targets = picked.has(id) && picked.size > 1 ? [...picked] : [id]

  function change(value: string | null) {
    if (value === null) return
    start(async () => {
      const result = await setDeviceKindAction(targets, isDeviceKind(value) ? value : null)
      if (!result.ok) toast.error(result.error ?? common('operationFailed'))
      else if (targets.length > 1) toast.success(t('kindBulkDone', { count: targets.length }))
    })
  }

  return (
    <Select value={kind ?? UNSET} onValueChange={change} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label={t('kind')}
        title={system}
        className={cn(
          'w-full border-transparent bg-transparent shadow-none dark:bg-transparent',
          !kind && 'text-muted-foreground',
        )}
      >
        <DeviceKindIcon kind={kind ?? UNSET} className="size-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">{kinds(kind ?? UNSET)}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>
          <DeviceKindIcon kind={UNSET} className="size-3.5" />
          {kinds(UNSET)}
        </SelectItem>
        {DEVICE_KINDS.map((option) => (
          <SelectItem key={option} value={option}>
            <DeviceKindIcon kind={option} className="size-3.5" />
            {kinds(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
