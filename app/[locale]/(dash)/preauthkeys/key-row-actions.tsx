'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CmdBlock } from '@/components/cmd-block'
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
import { useCurrentOrigin } from '@/lib/use-current-origin'
import { deleteKeyAction } from './actions'

const HS = process.env.NEXT_PUBLIC_HEADSCALE_URL

if (!HS) {
  throw new Error('NEXT_PUBLIC_HEADSCALE_URL is required')
}

export function KeyRowActions({
  id,
  plaintext,
  modeLabel,
}: {
  id: string
  plaintext?: string
  modeLabel: string
}) {
  const t = useTranslations('keyActions')
  const common = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [cmdOpen, setCmdOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const panel = useCurrentOrigin()

  function del() {
    start(async () => {
      const r = await deleteKeyAction(id)
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
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCmdOpen(true)}>
            {t('installCommands')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDelOpen(true)}
          >
            {t('deleteKey')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('commandsTitle', { mode: modeLabel })}</DialogTitle>
            <DialogDescription>
              {t('commandsDescription')}
            </DialogDescription>
          </DialogHeader>
          {plaintext ? (
            <div className="flex flex-col gap-3">
              <CmdBlock label="PreAuthKey" cmd={plaintext} />
              <CmdBlock
                label={t('linuxInstall')}
                cmd={`curl -fsSL ${panel}/api/scripts/install-tailscale.sh -o /tmp/ts-install.sh && sudo env HEADSCALE_URL="${HS}" bash /tmp/ts-install.sh ${plaintext}`}
              />
              <CmdBlock
                label={t('macInstall')}
                cmd={`P=$(curl -fsSL https://pkgs.tailscale.com/stable/ | grep -oE 'Tailscale-[0-9.]+-macos\\.pkg' | head -1) && curl -fsSL "https://pkgs.tailscale.com/stable/$P" -o /tmp/ts.pkg && sudo installer -pkg /tmp/ts.pkg -target / && sudo ln -sf "/Applications/Tailscale.app/Contents/MacOS/Tailscale" /usr/local/bin/tailscale && sudo tailscale up --login-server=${HS} --authkey=${plaintext}`}
              />
              <CmdBlock
                label={t('windowsInstall')}
                cmd={`iwr ${panel}/api/scripts/install-tailscale.ps1 -OutFile $env:TEMP\\ts.ps1; & $env:TEMP\\ts.ps1 -AuthKey "${plaintext}" -HeadscaleUrl "${HS}"`}
              />
              <CmdBlock
                label={t('directUp')}
                cmd={`sudo tailscale up --login-server=${HS} --authkey=${plaintext}`}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t('missingPlaintext')}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle', { id })}</AlertDialogTitle>
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
                del()
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
