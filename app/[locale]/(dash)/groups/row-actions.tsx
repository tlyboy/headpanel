'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  deleteGroupAction,
  renameGroupAction,
  resetGroupAdminPasswordAction,
} from './actions'

export interface GroupAdmin {
  id: number
  username: string
}

export function GroupRowActions({
  id,
  name,
  nodeCount,
  keyCount,
  isProtected,
  admins,
}: {
  id: number
  name: string
  nodeCount: number
  keyCount: number
  isProtected: boolean
  admins: GroupAdmin[]
}) {
  const t = useTranslations('groupActions')
  const common = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [delOpen, setDelOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [newName, setNewName] = useState(name)
  const [adminId, setAdminId] = useState<number | null>(admins[0]?.id ?? null)
  const [password, setPassword] = useState('')

  // 非面板建的组（映射到 headscale 既有 user）一律不可删；组内还有节点或授权 key
  // 时也不允许删：删 headscale user 会把它们一并销毁。
  // 这里只是提前拦一道，真正的守卫在服务端 deleteGroup 里。
  const blocked = isProtected || nodeCount > 0 || keyCount > 0

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
            <DropdownMenuItem
              onClick={() => {
                setNewName(name)
                setRenameOpen(true)
              }}
            >
              {t('rename')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={admins.length === 0}
              onClick={() => {
                setAdminId(admins[0]?.id ?? null)
                setPassword('')
                setPwOpen(true)
              }}
            >
              {t('resetPassword')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDelOpen(true)}
          >
            {common('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 弹窗渲染在菜单之外：菜单项一点就关，放里面会跟着卸载 */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('renameTitle', { name })}</DialogTitle>
            <DialogDescription>{t('renameDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`gname-${id}`}>{t('newName')}</Label>
            <Input
              id={`gname-${id}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
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
              disabled={pending || !newName.trim() || newName.trim() === name}
              onClick={() =>
                run(
                  () => renameGroupAction(id, newName),
                  t('renamed'),
                  () => setRenameOpen(false),
                )
              }
            >
              {pending ? common('saving') : common('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('resetPasswordTitle', { name })}</DialogTitle>
            <DialogDescription>
              {t('resetPasswordDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {admins.length > 1 && (
              <div className="flex flex-col gap-2">
                <Label>{t('account')}</Label>
                <Select
                  value={adminId == null ? '' : String(adminId)}
                  onValueChange={(v) => setAdminId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`gpw-${id}`}>
                {admins.length === 1
                  ? t('newPasswordFor', { username: admins[0].username })
                  : t('newPassword')}
              </Label>
              <Input
                id={`gpw-${id}`}
                type="text"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPwOpen(false)}
              disabled={pending}
            >
              {common('cancel')}
            </Button>
            <Button
              disabled={pending || adminId == null || password.length < 6}
              onClick={() =>
                run(
                  () =>
                    resetGroupAdminPasswordAction({
                      groupId: id,
                      adminId: adminId as number,
                      password,
                    }),
                  t('passwordReset'),
                  () => {
                    setPwOpen(false)
                    setPassword('')
                  },
                )
              }
            >
              {pending ? common('saving') : common('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
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
            <AlertDialogCancel disabled={pending}>
              {common('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || blocked}
              onClick={(e) => {
                e.preventDefault()
                run(
                  () => deleteGroupAction(id),
                  t('deleted'),
                  () => setDelOpen(false),
                )
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
