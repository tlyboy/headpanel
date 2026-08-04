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
import { deleteGroupAction } from './actions'

export function GroupRowActions({
  id,
  name,
  nodeCount,
  keyCount,
  isProtected,
}: {
  id: number
  name: string
  nodeCount: number
  keyCount: number
  isProtected: boolean
}) {
  const t = useTranslations('groupActions')
  const common = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  // Groups not created in the dashboard (mapped to an existing headscale user) can never be deleted; groups with nodes or auth keys
  // also can't be deleted: deleting the headscale user would destroy them too.
  // This is just an early check; the actual guard is in the server-side deleteGroup.
  const blocked = isProtected || nodeCount > 0 || keyCount > 0

  function del() {
    start(async () => {
      const r = await deleteGroupAction(id)
      if (r.ok) {
        toast.success(t('deleted'))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(r.error ?? common('deleteFailed'))
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          {common('delete')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle', { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {isProtected
              ? t('deleteProtected')
              : blocked
                ? t('deleteBlocked', { nodeCount, keyCount })
                : t('deleteDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{common('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || blocked}
            onClick={(e) => {
              e.preventDefault()
              del()
            }}
          >
            {pending ? t('deleting') : t('confirmDelete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
