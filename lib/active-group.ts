import 'server-only'

import { cookies } from 'next/headers'
import { visibleGroups } from '@/lib/groups'
import type { Session } from '@/lib/auth'
import type { Group } from '@/lib/db/schema'

export const ACTIVE_GROUP_COOKIE = 'hs_group'

// super 默认看到全网，可以把视图收敛到某一个组；其余角色本来就被 scopeNodes
// 限死在自己组里，这个选择对他们没有意义，也不该给他们。
// 返回 null = 不收敛（super 看全部 / 非 super 走原有的组隔离）。
//
// cookie 的值是客户端可改的，所以必须回到 visibleGroups 里核对：
// 只认当前会话本来就看得见的组，改 cookie 越权不了。
export async function readActiveGroup(session: Session): Promise<Group | null> {
  if (session.role !== 'super') return null
  const raw = (await cookies()).get(ACTIVE_GROUP_COOKIE)?.value
  if (!raw) return null
  const id = Number(raw)
  if (!Number.isInteger(id)) return null
  return visibleGroups(session).find((g) => g.id === id) ?? null
}
