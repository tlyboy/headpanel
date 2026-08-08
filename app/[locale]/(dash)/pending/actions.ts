'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { approvedTag } from '@/lib/default-zone'
import { groupForNode } from '@/lib/groups'
import { setNodeStatus } from '@/lib/nodes-sync'
import {
  deleteNode,
  getNode,
  setNodeTags,
  HeadscaleError,
} from '@/lib/headscale'

export interface ActionResult {
  ok: boolean
  error?: string
}

function fail(e: unknown, unknownMessage: string): ActionResult {
  if (e instanceof HeadscaleError) return { ok: false, error: e.message }
  return { ok: false, error: e instanceof Error ? e.message : unknownMessage }
}

// 批准：给节点打放行 tag（ACL 放通互通），本地状态记 approved。tag 取所属组的
// ok_tag；不属于任何组的节点归默认区，打默认区的 approvedTag。
// 先解析节点所属组并校验当前会话有权操作（防越权批他组节点）。
export async function approveNodeAction(id: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations('actionErrors'),
  ])
  try {
    const node = await getNode(id)
    const group = groupForNode(session, node)
    const tag = group?.okTag ?? approvedTag()
    await setNodeTags(id, [tag])
    setNodeStatus(id, 'approved', session.sub)
    auditAfter(
      'node.approve',
      id,
      `group=${group?.slug ?? 'default'} tags=[${tag}]`,
      {
        groupId: group?.id ?? null,
        actor: session.sub,
      },
    )
    revalidatePath('/pending')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

// 拒绝：彻底删除节点（IP 回收），本地状态记 rejected（节点删后 meta 会被同步清理）
export async function rejectNodeAction(id: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations('actionErrors'),
  ])
  try {
    const node = await getNode(id)
    const group = groupForNode(session, node)
    setNodeStatus(id, 'rejected', session.sub)
    await deleteNode(id)
    auditAfter('node.reject', id, `group=${group?.slug ?? 'default'} deleted`, {
      groupId: group?.id ?? null,
      actor: session.sub,
    })
    revalidatePath('/pending')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}
