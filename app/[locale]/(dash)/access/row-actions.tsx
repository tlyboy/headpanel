'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { MoreHorizontal } from 'lucide-react'
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
import { deleteGrantAction } from './actions'

export function GrantRowActions({ id, src, dst }: { id: number; src: string; dst: string }) {
  const t = useTranslations('grantActions')
  const common = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [delOpen, setDelOpen] = useState(false)

  function remove() {
    start(async () => {
      const r = await deleteGrantAction(id)
      if (r.ok) {
        toast.success(t('deleted'))
        setDelOpen(false)
        router.refresh()
      } else {
        toast.error(r.error ?? common('deleteFailed'))
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('menu')} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={() => setDelOpen(true)}>
            {common('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* The dialog renders outside the menu: clicking a menu item closes it, so it would be unmounted if placed inside */}
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle', { src, dst })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                remove()
              }}
            >
              {pending ? t('deleting') : t('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
