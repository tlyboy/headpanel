'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
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

// Approve: apply the node's "owning group's ok_tag" (allow communication within the group via ACL), and record the local status as approved.
// First resolve the node's owning group and verify that the current session is authorized to operate on it (prevent approving nodes in other groups without permission).
export async function approveNodeAction(id: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations('actionErrors'),
  ])
  try {
    const node = await getNode(id)
    const group = groupForNode(session, node)
    await setNodeTags(id, [group.okTag])
    setNodeStatus(id, 'approved', session.sub)
    auditAfter(
      'node.approve',
      id,
      `group=${group.slug} tags=[${group.okTag}]`,
      {
        groupId: group.id,
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

// Reject: permanently delete the node (reclaim its IP) and set its local status to rejected (after the node is deleted, its meta will be cleaned up during synchronization)
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
    auditAfter('node.reject', id, `group=${group.slug} deleted`, {
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
