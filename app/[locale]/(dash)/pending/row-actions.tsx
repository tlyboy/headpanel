'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

// 与其余列表页一致：操作列里只放一个 ⋯。并排的行内按钮会让列宽由「动作最多的
// 那一行」决定，横向滚动时右侧那条固定列的位置也就跟着页面变。
export function PendingRowActions({ id, name }: { id: string; name: string }) {
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('menu')}
            disabled={pending}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              run(approveNodeAction(id), t('approved', { name }))
            }
          >
            {t('approve')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setRejectOpen(true)}
          >
            {t('reject')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 弹窗渲染在菜单之外：菜单项一点就关，弹窗跟着卸载就打不开了 */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rejectTitle', { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rejectDescription')}
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
                run(rejectNodeAction(id), t('rejected', { name }))
                setRejectOpen(false)
              }}
            >
              {pending ? common('processing') : t('confirmReject')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
