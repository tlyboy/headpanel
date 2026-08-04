import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import {
  listGroups,
  groupOfNode,
  keyBelongsToGroup,
  isPanelManagedGroup,
} from '@/lib/groups'
import { listNodes, listPreAuthKeys } from '@/lib/headscale'
import { db } from '@/lib/db'
import { admins } from '@/lib/db/schema'
import { fmtTime } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CreateGroup } from './group-form'
import { GroupRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const [, t] = await Promise.all([requireSuper(), getTranslations('groups')])
  const livePromise = Promise.all([listNodes(), listPreAuthKeys()])
  const groups = listGroups()
  const adminRows = db.select().from(admins).all()
  const [nodes, hsKeys] = await livePromise

  // groupId -> 节点数（按门票 tag 归属，避免 tagged-devices 抹除问题）；
  // groupId -> 授权 key 数（按 headscale user 归属）；
  // 两者都用于在删除弹窗里提前拦住非空组（服务端 deleteGroup 有同样的守卫）
  // groupId -> 管理员账号名列表
  const nodeCount = new Map<number, number>()
  for (const n of nodes) {
    const g = groupOfNode(n, groups)
    if (g) nodeCount.set(g.id, (nodeCount.get(g.id) ?? 0) + 1)
  }
  const keyCount = new Map<number, number>()
  for (const g of groups) {
    keyCount.set(g.id, hsKeys.filter((k) => keyBelongsToGroup(k, g)).length)
  }
  // 既要显示名字，也要把 id 传给行操作（重置密码按 id 定位账号）
  const adminsByGroup = new Map<number, { id: number; username: string }[]>()
  for (const a of adminRows) {
    if (a.groupId == null) continue
    const list = adminsByGroup.get(a.groupId) ?? []
    list.push({ id: a.id, username: a.username })
    adminsByGroup.set(a.groupId, list)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <CreateGroup />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead>slug</TableHead>
              <TableHead>{t('accessTag')}</TableHead>
              <TableHead>{t('nodeCount')}</TableHead>
              <TableHead>{t('adminAccounts')}</TableHead>
              <TableHead>{t('createdAt')}</TableHead>
              <TableHead className="w-12 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="text-muted-foreground">{g.id}</TableCell>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="font-mono text-xs">{g.slug}</TableCell>
                <TableCell className="font-mono text-xs">{g.okTag}</TableCell>
                <TableCell>{nodeCount.get(g.id) ?? 0}</TableCell>
                <TableCell className="text-xs">
                  {(adminsByGroup.get(g.id) ?? [])
                    .map((a) => a.username)
                    .join(', ') || '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtTime(g.createdAt.replace(' ', 'T') + 'Z')}
                </TableCell>
                <TableCell className="text-right">
                  <GroupRowActions
                    id={g.id}
                    name={g.name}
                    nodeCount={nodeCount.get(g.id) ?? 0}
                    keyCount={keyCount.get(g.id) ?? 0}
                    isProtected={!isPanelManagedGroup(g)}
                    admins={adminsByGroup.get(g.id) ?? []}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
