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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  approveRouteAction,
  makePrimaryAction,
  revokeRouteAction,
} from './actions'

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
  const [toggleOpen, setToggleOpen] = useState(false)
  const [primaryOpen, setPrimaryOpen] = useState(false)

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    onOk: () => void,
  ) {
    start(async () => {
      const r = await fn()
      if (r.ok) {
        toast.success(okMsg)
        onOk()
        router.refresh()
      } else {
        toast.error(r.error ?? common('operationFailed'))
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('menu')}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {/* 只有已批准且还不是承载方的节点才谈得上「设为承载」 */}
            <DropdownMenuItem
              disabled={!approved || isPrimary}
              onClick={() => setPrimaryOpen(true)}
            >
              {t('makePrimary')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={approved ? 'destructive' : undefined}
            onClick={() => setToggleOpen(true)}
          >
            {approved ? t('revoke') : t('approve')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 弹窗渲染在菜单之外：菜单项一点就关，放里面会跟着卸载 */}
      <AlertDialog open={primaryOpen} onOpenChange={setPrimaryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('makePrimaryTitle', { route, node: nodeName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('makePrimaryDescription')}
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
                run(
                  () => makePrimaryAction(route, nodeId),
                  t('madePrimary'),
                  () => setPrimaryOpen(false),
                )
              }}
            >
              {pending ? t('working') : common('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={toggleOpen} onOpenChange={setToggleOpen}>
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
                run(
                  () =>
                    approved
                      ? revokeRouteAction(nodeId, route)
                      : approveRouteAction(nodeId, route),
                  approved ? t('revoked') : t('approved'),
                  () => setToggleOpen(false),
                )
              }}
            >
              {pending ? t('working') : common('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
