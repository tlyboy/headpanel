'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { approveRouteAction, revokeRouteAction } from './actions'

export function RouteRowActions({
  nodeId,
  nodeName,
  route,
  approved,
  isPrimary,
}: {
  nodeId: string
  nodeName: string
  route: string
  approved: boolean
  isPrimary: boolean
}) {
  const t = useTranslations('subnets')
  const common = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)

  function run() {
    start(async () => {
      const r = approved
        ? await revokeRouteAction(nodeId, route)
        : await approveRouteAction(nodeId, route)
      if (r.ok) {
        toast.success(approved ? t('revoked') : t('approved'))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(r.error ?? common('operationFailed'))
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={approved ? 'text-destructive' : ''}
        >
          {approved ? t('revoke') : t('approve')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {approved
              ? t('revokeTitle', { route, node: nodeName })
              : t('approveTitle', { route, node: nodeName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {approved
              ? isPrimary
                ? t('revokePrimaryDescription')
                : t('revokeDescription')
              : t('approveDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {common('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              run()
            }}
          >
            {pending ? t('working') : common('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
