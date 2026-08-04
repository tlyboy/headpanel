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
  // 非面板建的组（映射到 headscale 既有 user）一律不可删；组内还有节点或授权 key
  // 时也不允许删：删 headscale user 会把它们一并销毁。
  // 这里只是提前拦一道，真正的守卫在服务端 deleteGroup 里。
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
