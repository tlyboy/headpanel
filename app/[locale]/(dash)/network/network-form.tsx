'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { updateIpv4PrefixAction } from './actions'

export function NetworkForm({
  ipv4Prefix,
  usedIpv4,
}: {
  ipv4Prefix: string
  usedIpv4: string[]
}) {
  const t = useTranslations('networkForm')
  const common = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [value, setValue] = useState(ipv4Prefix)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const changed = value.trim() !== ipv4Prefix

  function submit() {
    start(async () => {
      const r = await updateIpv4PrefixAction(value)
      if (r.ok) {
        toast.success(t('updated'))
        setConfirmOpen(false)
        router.refresh()
      } else {
        toast.error(r.error ?? common('updateFailed'))
      }
    })
  }

  return (
    <>
      <div className="flex max-w-xl flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ipv4Prefix">{t('ipv4Pool')}</Label>
          <Input
            id="ipv4Prefix"
            className="font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="100.64.0.0/24"
            disabled={pending}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || !changed}
            onClick={() => setConfirmOpen(true)}
          >
            <Save className="size-4" />
            {pending ? common('saving') : t('saveRestart')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !changed}
            onClick={() => setValue(ipv4Prefix)}
          >
            <RotateCcw className="size-4" />
            {t('restore')}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('description', {
                from: ipv4Prefix,
                to: value.trim(),
                count: usedIpv4.length,
                ips: usedIpv4.join(', ') || t('none'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              {pending ? common('processing') : t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
