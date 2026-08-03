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
}: {
  id: number
  name: string
  nodeCount: number
  keyCount: number
}) {
  const t = useTranslations('groupActions')
  const common = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  // Deletion is not allowed while the group still has nodes or authorized keys: deleting the headscale user would destroy them too.
  // This is just an early check; the actual guard is in the server-side deleteGroup.
  const blocked = nodeCount > 0 || keyCount > 0

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
            {blocked
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
