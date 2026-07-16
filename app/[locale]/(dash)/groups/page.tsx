import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { listGroups, groupOfNode } from '@/lib/groups'
import { listNodes } from '@/lib/headscale'
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
  const nodesPromise = listNodes()
  const groups = listGroups()
  const adminRows = db.select().from(admins).all()
  const nodes = await nodesPromise

  // groupId -> 节点数（按门票 tag 归属，避免 tagged-devices 抹除问题）；
  // groupId -> 管理员账号名列表
  const nodeCount = new Map<number, number>()
  for (const n of nodes) {
    const g = groupOfNode(n, groups)
    if (g) nodeCount.set(g.id, (nodeCount.get(g.id) ?? 0) + 1)
  }
  const adminsByGroup = new Map<number, string[]>()
  for (const a of adminRows) {
    if (a.groupId == null) continue
    const list = adminsByGroup.get(a.groupId) ?? []
    list.push(a.username)
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
                  {(adminsByGroup.get(g.id) ?? []).join(', ') || '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtTime(g.createdAt.replace(' ', 'T') + 'Z')}
                </TableCell>
                <TableCell className="text-right">
                  <GroupRowActions id={g.id} name={g.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
