'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createGroupAction } from './actions'

// Defaults to self-managed open state with a built-in trigger button (used on the groups page); passing open/onOpenChange makes it
// controlled, and hideTrigger lets it be opened elsewhere (such as the group switcher in the sidebar).
export function CreateGroup({
  open: openProp,
  onOpenChange,
  hideTrigger,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
} = {}) {
  const t = useTranslations('groupForm')
  const common = useTranslations('common')
  const router = useRouter()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChange?.(next)
  }
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  function reset() {
    setName('')
    setSlug('')
    setAdminUsername('')
    setAdminPassword('')
  }

  function submit() {
    start(async () => {
      const r = await createGroupAction({
        name,
        slug,
        adminUsername,
        adminPassword,
      })
      if (r.ok) {
        toast.success(t('created'))
        setOpen(false)
        reset()
        router.refresh()
      } else {
        toast.error(r.error ?? t('createFailed'))
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button>{t('trigger')}</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t('name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">{t('slug')}</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t('slugPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="au">{t('adminUsername')}</Label>
            <Input
              id="au"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ap">{t('adminPassword')}</Label>
            <Input
              id="ap"
              type="text"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {common('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? t('creating') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
