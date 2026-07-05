import { getTranslations } from 'next-intl/server'
import { listPreAuthKeys, type HsPreAuthKey } from '@/lib/headscale'
import { requireSession } from '@/lib/auth'
import { visibleGroups } from '@/lib/groups'
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
import { CreateKey } from './create-key'
import { KeyRowActions } from './key-row-actions'

export const dynamic = 'force-dynamic'

// 持票（含组 ok_tag）= 直接放行；无 tag = 需审核（接入后进待审批）
function modeOf(aclTags: string[]): { key: 'direct' | 'review'; cls: string } {
  if (aclTags.length)
    return { key: 'direct', cls: 'bg-emerald-600 text-white' }
  return { key: 'review', cls: 'bg-amber-600 text-white' }
}

export default async function PreAuthKeysPage() {
  const session = await requireSession()
  const [t, common] = await Promise.all([
    getTranslations('preAuthKeys'),
    getTranslations('common'),
  ])
  const groups = visibleGroups(session)
  const nameByHsUser = new Map(groups.map((g) => [g.hsUserId, g.name]))

  // headscale 的 ?user= 过滤失效（恒返回全部 key），故拉一次、按 key.user.id 归属过滤，
  // 既避免同一 key 被每个组重复显示，又实现按组隔离
  const all = groups.length > 0 ? await listPreAuthKeys(groups[0].hsUserId) : []
  const keys: { key: HsPreAuthKey; groupName: string }[] = all
    .filter((k) => nameByHsUser.has(k.user?.id ?? ''))
    .map((k) => ({ key: k, groupName: nameByHsUser.get(k.user!.id) ?? '—' }))

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('description', { count: keys.length })}
          </p>
        </div>
        <CreateKey groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>{t('group')}</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>{t('mode')}</TableHead>
              <TableHead>{t('reusable')}</TableHead>
              <TableHead>{t('used')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('expiration')}</TableHead>
              <TableHead className="w-12 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-8 text-center"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              keys.map(({ key: k, groupName }) => {
                const expired =
                  !isNever(k.expiration) &&
                  new Date(k.expiration).getTime() < now
                const m = modeOf(k.aclTags ?? [])
                return (
                  <TableRow key={k.id}>
                    <TableCell className="text-muted-foreground">
                      {k.id}
                    </TableCell>
                    <TableCell className="text-sm">{groupName}</TableCell>
                    <TableCell className="font-mono text-xs">{k.key}</TableCell>
                    <TableCell>
                      <Badge className={m.cls}>{t(m.key)}</Badge>
                    </TableCell>
                    <TableCell>{k.reusable ? common('yes') : common('no')}</TableCell>
                    <TableCell>{k.used ? common('yes') : common('no')}</TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge variant="secondary">{t('expired')}</Badge>
                      ) : (
                        <Badge className="bg-emerald-600 text-white">
                          {t('valid')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {isNever(k.expiration) ? t('permanent') : fmtTime(k.expiration)}
                    </TableCell>
                    <TableCell className="text-right">
                      <KeyRowActions
                        id={k.id}
                        plaintext={plain.get(k.id)}
                        modeLabel={t(m.key)}
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
