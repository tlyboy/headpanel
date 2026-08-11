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

// Like the other list pages, keep just one ⋯ in the actions column. Inline buttons side by side make the column width depend on "the row with the most actions",
// so the position of the fixed column on the right shifts with the page when scrolling horizontally.
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

      {/* Render the dialog outside the menu: clicking a menu item closes the menu, and the dialog would be unmounted with it before it can open. */}
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
