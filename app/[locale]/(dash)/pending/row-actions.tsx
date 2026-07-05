'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  approveNodeAction,
  rejectNodeAction,
  type ActionResult,
} from './actions'

export function PendingRowActions({
  id,
  name,
}: {
  id: string
  name: string
}) {
  const t = useTranslations('pendingActions')
  const common = useTranslations('common')
  const [pending, start] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)

  function run(p: Promise<ActionResult>, okMsg: string) {
    start(async () => {
      const r = await p
      if (r.ok) toast.success(okMsg)
      else toast.error(r.error ?? common('operationFailed'))
    })
  }

  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(approveNodeAction(id), t('approved', { name }))}
      >
        {t('approve')}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => setRejectOpen(true)}
      >
        {t('reject')}
      </Button>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rejectTitle', { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rejectDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                run(rejectNodeAction(id), t('rejected', { name }))
                setRejectOpen(false)
              }}
            >
              {pending ? common('processing') : t('confirmReject')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
