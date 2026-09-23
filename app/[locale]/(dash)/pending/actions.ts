'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { nodeTarget } from '@/lib/audit'
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

// Approve: add the release tag to the node (allow ACL traffic between nodes) and set its local status to approved. Use the owning group's
// ok_tag; nodes that don't belong to any group are assigned to the default zone and get the default zone's approvedTag.
// First resolve the node's group and verify that the current session is authorized to act on it (to prevent approving nodes in other groups without permission).
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
      nodeTarget(node),
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
    auditAfter(
      'node.reject',
      nodeTarget(node),
      `group=${group?.slug ?? 'default'} deleted`,
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
