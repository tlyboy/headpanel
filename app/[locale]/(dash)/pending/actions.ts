'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { audit } from '@/lib/db'
import { groupForNode } from '@/lib/groups'
import { setNodeStatus } from '@/lib/nodes-sync'
import { deleteNode, getNode, setNodeTags, HeadscaleError } from '@/lib/headscale'

export interface ActionResult {
  ok: boolean
  error?: string
}

function fail(e: unknown, unknownMessage: string): ActionResult {
  if (e instanceof HeadscaleError) return { ok: false, error: e.message }
  return { ok: false, error: e instanceof Error ? e.message : unknownMessage }
}

// 批准：给节点打【所属组的 ok_tag】（ACL 放通组内互通），本地状态记 approved。
// 先解析节点所属组并校验当前会话有权操作（防越权批他组节点）。
export async function approveNodeAction(id: string): Promise<ActionResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  try {
    const node = await getNode(id)
    const group = groupForNode(session, node)
    await setNodeTags(id, [group.okTag])
    setNodeStatus(id, 'approved', session.sub)
    await audit('node.approve', id, `group=${group.slug} tags=[${group.okTag}]`, {
      groupId: group.id,
      actor: session.sub,
    })
    revalidatePath('/pending')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

// 拒绝：彻底删除节点（IP 回收），本地状态记 rejected（节点删后 meta 会被同步清理）
export async function rejectNodeAction(id: string): Promise<ActionResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  try {
    const node = await getNode(id)
    const group = groupForNode(session, node)
    setNodeStatus(id, 'rejected', session.sub)
    await deleteNode(id)
    await audit('node.reject', id, `group=${group.slug} deleted`, {
      groupId: group.id,
      actor: session.sub,
    })
    revalidatePath('/pending')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}
