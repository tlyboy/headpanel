import 'server-only'

import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preauthKeys } from '@/lib/db/schema'
import { type HsPreAuthKey } from '@/lib/headscale'

// 清理本地 preauth_keys 里 headscale 已不存在的行（明文 key 不该长期残留）。
// 历史上删组会让 headscale 连带销毁该 user 的 key，本地备份却留了下来。
// 传入的必须是刚从 headscale 拉到的全量列表；空列表一律跳过，避免接口异常
// 返回空时把所有明文备份清光。
export function pruneOrphanKeys(liveKeys: HsPreAuthKey[]): void {
  if (liveKeys.length === 0) return
  const liveIds = new Set(liveKeys.map((k) => k.id))
  const orphanIds = db
    .select({ headscaleId: preauthKeys.headscaleId })
    .from(preauthKeys)
    .all()
    .map((r) => r.headscaleId)
    .filter((id) => !liveIds.has(id))
  if (orphanIds.length) {
    db.delete(preauthKeys)
      .where(inArray(preauthKeys.headscaleId, orphanIds))
      .run()
  }
}
