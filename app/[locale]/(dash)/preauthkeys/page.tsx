import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import {
  getDefaultHeadscaleConnection,
  listPreAuthKeys,
  type HsPreAuthKey,
} from '@/lib/headscale'
import { getPanelBasePath } from '@/lib/panel-base-path'
import { requireSession } from '@/lib/auth'
import { visibleGroups } from '@/lib/groups'
import { pruneOrphanKeys } from '@/lib/keys-sync'
import { db } from '@/lib/db'
import { preauthKeys as preauthKeysTable } from '@/lib/db/schema'
import { fmtTime, isNever } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
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
import { CreateKey } from './create-key'
import { KeyRowActions } from './key-row-actions'

export const dynamic = 'force-dynamic'

const PAGE = 'preauthkeys'

// 持票（含组 ok_tag）= 直接放行；无 tag = 需审核（接入后进待审批）
function modeOf(aclTags: string[]): {
  key: 'direct' | 'review'
  variant: 'success' | 'warning'
} {
  if (aclTags.length) return { key: 'direct', variant: 'success' } as const
  return { key: 'review', variant: 'warning' } as const
}

export default async function PreAuthKeysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, t, common, sp, cookieStore] = await Promise.all([
    requireSession(),
    getTranslations('preAuthKeys'),
    getTranslations('common'),
    searchParams,
    cookies(),
  ])
  const rawQ = sp.q
  const q = ((Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? '').trim().toLowerCase()
  const columns: ColumnDef[] = [
    { key: 'id', label: 'ID' },
    { key: 'group', label: t('group') },
    { key: 'key', label: 'Key' },
    { key: 'mode', label: t('mode') },
    { key: 'reusable', label: t('reusable') },
    { key: 'used', label: t('used') },
    { key: 'status', label: t('status') },
    { key: 'expiration', label: t('expiration') },
    { key: 'actions', label: t('actions'), locked: true },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)
  const groups = visibleGroups(session)
  const headscaleUrl = getDefaultHeadscaleConnection().serverUrl
  const panelBasePath = getPanelBasePath()
  const nameByHsUser = new Map(groups.map((g) => [g.hsUserId, g.name]))

  // headscale 的 ?user= 过滤失效（恒返回全部 key），故拉一次、按 key.user.id 归属过滤，
  // 既避免同一 key 被每个组重复显示，又实现按组隔离。
  // super 要看到全部 key（含 admin 等不属于任何面板组的 headscale user），
  // 所以它即便一个组都没有也要拉——否则删光组后整页空白，看着像 key 被删了。
  // 降级成组身份后 role 已不是 super，组外的 key 自然不再露出
  const showUngrouped = session.role === 'super'
  const all = showUngrouped || groups.length > 0 ? await listPreAuthKeys() : []
  // headscale 侧已消失的 key，其本地明文备份一并清掉（删组会连带销毁 key）
  pruneOrphanKeys(all)
  const keys: { key: HsPreAuthKey; groupName: string }[] = []
  for (const key of all) {
    const groupName = nameByHsUser.get(key.user?.id ?? '')
    if (groupName) {
      keys.push({ key, groupName })
    } else if (showUngrouped) {
      // 不归任何面板组的 key，退而标出它在 headscale 侧的 user 名
      keys.push({ key, groupName: key.user?.name ?? '—' })
    }
  }
  // key 在列表里是掩码，但前缀足够用来对上某一把；连组名一起搜
  const shown = q
    ? keys.filter((e) =>
        [e.key.id, e.key.key, e.groupName].join(' ').toLowerCase().includes(q),
      )
    : keys

  // RSC + force-dynamic：每次请求服务端渲染，取当前时间判断 key 是否过期，符合预期
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  // 本地明文备份：headscaleId -> 明文 key
  const plain = new Map<string, string>()
  try {
    for (const r of db.select().from(preauthKeysTable).all())
      plain.set(r.headscaleId, r.key)
  } catch {
    /* 表不存在等，忽略 */
  }

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        placeholder={t('searchPlaceholder')}
        actions={
          <CreateKey
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            canUseDefault={showUngrouped}
          />
        }
        columns={
          <ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {show('id') && <TableHead className="w-12">ID</TableHead>}
              {show('group') && <TableHead>{t('group')}</TableHead>}
              {show('key') && <TableHead>Key</TableHead>}
              {show('mode') && <TableHead>{t('mode')}</TableHead>}
              {show('reusable') && <TableHead>{t('reusable')}</TableHead>}
              {show('used') && <TableHead>{t('used')}</TableHead>}
              {show('status') && <TableHead>{t('status')}</TableHead>}
              {show('expiration') && <TableHead>{t('expiration')}</TableHead>}
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
              shown.map(({ key: k, groupName }) => {
                const expired =
                  !isNever(k.expiration) &&
                  new Date(k.expiration).getTime() < now
                const m = modeOf(k.aclTags ?? [])
                return (
                  <TableRow key={k.id}>
                    {show('id') && (
                      <TableCell className="text-muted-foreground">
                        {k.id}
                      </TableCell>
                    )}
                    {show('group') && (
                      <TableCell className="text-sm">{groupName}</TableCell>
                    )}
                    {show('key') && (
                      <TableCell className="font-mono text-xs">
                        {k.key}
                      </TableCell>
                    )}
                    {show('mode') && (
                      <TableCell>
                        <Badge variant={m.variant}>{t(m.key)}</Badge>
                      </TableCell>
                    )}
                    {show('reusable') && (
                      <TableCell>
                        {k.reusable ? common('yes') : common('no')}
                      </TableCell>
                    )}
                    {show('used') && (
                      <TableCell>
                        {k.used ? common('yes') : common('no')}
                      </TableCell>
                    )}
                    {show('status') && (
                      <TableCell>
                        {expired ? (
                          <Badge variant="secondary">{t('expired')}</Badge>
                        ) : (
                          <Badge variant="success">{t('valid')}</Badge>
                        )}
                      </TableCell>
                    )}
                    {show('expiration') && (
                      <TableCell className="text-xs text-muted-foreground">
                        {isNever(k.expiration)
                          ? t('permanent')
                          : fmtTime(k.expiration)}
                      </TableCell>
                    )}
                    <TableCell className={STICKY_ACTIONS}>
                      <KeyRowActions
                        id={k.id}
                        plaintext={plain.get(k.id)}
                        modeLabel={t(m.key)}
                        headscaleUrl={headscaleUrl}
                        panelBasePath={panelBasePath}
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
