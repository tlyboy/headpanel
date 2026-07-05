'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  deleteNodeAction,
  expireNodeAction,
  renameNodeAction,
  saveNoteAction,
  type ActionResult,
} from './actions'

export function NodeRowActions({
  id,
  name,
  note,
}: {
  id: string
  name: string
  note?: string
}) {
  const t = useTranslations('nodeActions')
  const common = useTranslations('common')
  const [pending, start] = useTransition()
  const [renameOpen, setRenameOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [expireOpen, setExpireOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [newName, setNewName] = useState(name)
  const [noteVal, setNoteVal] = useState(note ?? '')

  function run(p: Promise<ActionResult>, okMsg: string, onOk?: () => void) {
    start(async () => {
      const r = await p
      if (r.ok) {
        toast.success(okMsg)
        onOk?.()
      } else {
        toast.error(r.error ?? common('operationFailed'))
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            {t('rename')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNoteOpen(true)}>
            {t('editNote')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setExpireOpen(true)}>
            {t('expire')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            {t('deleteNode')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('renameDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="newName">{t('newAlias')}</Label>
            <Input
              id="newName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('aliasPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameOpen(false)}
              disabled={pending}
            >
              {common('cancel')}
            </Button>
            <Button
              disabled={pending || !newName.trim() || newName === name}
              onClick={() =>
                run(renameNodeAction(id, newName), t('renamed'), () =>
                  setRenameOpen(false),
                )
              }
            >
              {pending ? t('submitting') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('noteTitle')}</DialogTitle>
            <DialogDescription>
              {t('noteDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">{t('note')}</Label>
            <Input
              id="note"
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              placeholder={t('notePlaceholder')}
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNoteOpen(false)}
              disabled={pending}
            >
              {common('cancel')}
            </Button>
            <Button
              disabled={pending || noteVal === (note ?? '')}
              onClick={() =>
                run(saveNoteAction(id, noteVal), t('noteSaved'), () =>
                  setNoteOpen(false),
                )
              }
            >
              {pending ? common('saving') : common('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={expireOpen} onOpenChange={setExpireOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('expireTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('expireDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                run(expireNodeAction(id), t('expired'), () =>
                  setExpireOpen(false),
                )
              }}
            >
              {pending ? common('processing') : t('confirmExpire')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                run(deleteNodeAction(id), t('deleted'), () => setDeleteOpen(false))
              }}
            >
              {pending ? common('processing') : t('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
