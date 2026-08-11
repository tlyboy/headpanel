import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
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
import { ListFilters } from '@/components/list-filters'
import { ColumnFilter } from '@/components/column-filter'
import {
  columnCookieName,
  makeIsVisible,
  parseHidden,
  visibleCount,
  type ColumnDef,
} from '@/components/columns'
import { STICKY_ACTIONS } from '@/lib/table'
import { CreateGroup } from './group-form'
import { GroupRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

const PAGE = 'groups'

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [, t, sp, cookieStore] = await Promise.all([
    requireSuper(),
    getTranslations('groups'),
    searchParams,
    cookies(),
  ])
  const rawQ = sp.q
  const q = ((Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? '').trim().toLowerCase()
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

  // 搜索覆盖管理员账号名：找「谁能管这个组」时手边有的往往正是那个账号
  const shown = q
    ? groups.filter((g) =>
        [
          g.name,
          g.slug,
          g.okTag,
          ...(adminsByGroup.get(g.id) ?? []).map((a) => a.username),
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    : groups

  const columns: ColumnDef[] = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: t('name') },
    { key: 'slug', label: 'slug' },
    { key: 'accessTag', label: t('accessTag') },
    { key: 'nodeCount', label: t('nodeCount') },
    { key: 'admins', label: t('adminAccounts') },
    { key: 'createdAt', label: t('createdAt') },
    { key: 'actions', label: t('actions'), locked: true },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        placeholder={t('searchPlaceholder')}
        actions={<CreateGroup />}
        columns={
          <ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {show('id') && <TableHead className="w-12">ID</TableHead>}
              {show('name') && <TableHead>{t('name')}</TableHead>}
              {show('slug') && <TableHead>slug</TableHead>}
              {show('accessTag') && <TableHead>{t('accessTag')}</TableHead>}
              {show('nodeCount') && <TableHead>{t('nodeCount')}</TableHead>}
              {show('admins') && <TableHead>{t('adminAccounts')}</TableHead>}
              {show('createdAt') && <TableHead>{t('createdAt')}</TableHead>}
              <TableHead className={STICKY_ACTIONS} aria-label={t('actions')} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCount(columns, hidden)}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((g) => (
                <TableRow key={g.id}>
                  {show('id') && (
                    <TableCell className="text-muted-foreground">
                      {g.id}
                    </TableCell>
                  )}
                  {show('name') && (
                    <TableCell className="font-medium">{g.name}</TableCell>
                  )}
                  {show('slug') && (
                    <TableCell className="font-mono text-xs">
                      {g.slug}
                    </TableCell>
                  )}
                  {show('accessTag') && (
                    <TableCell className="font-mono text-xs">
                      {g.okTag}
                    </TableCell>
                  )}
                  {show('nodeCount') && (
                    <TableCell>{nodeCount.get(g.id) ?? 0}</TableCell>
                  )}
                  {show('admins') && (
                    <TableCell className="text-xs">
                      {(adminsByGroup.get(g.id) ?? [])
                        .map((a) => a.username)
                        .join(', ') || '—'}
                    </TableCell>
                  )}
                  {show('createdAt') && (
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtTime(g.createdAt.replace(' ', 'T') + 'Z')}
                    </TableCell>
                  )}
                  <TableCell className={STICKY_ACTIONS}>
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
