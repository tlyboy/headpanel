'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession, type Session } from '@/lib/auth'
import { audit } from '@/lib/db'
import { groupForNode } from '@/lib/groups'
import { setNodeNote } from '@/lib/nodes-sync'
import {
  deleteNode,
  expireNode,
  getNode,
  renameNode,
  HeadscaleError,
} from '@/lib/headscale'
import type { Group } from '@/lib/db/schema'

export interface ActionResult {
  ok: boolean
  error?: string
}

function fail(e: unknown, unknownMessage: string): ActionResult {
  if (e instanceof HeadscaleError) return { ok: false, error: e.message }
  return { ok: false, error: e instanceof Error ? e.message : unknownMessage }
}

// 取节点并校验当前会话有权操作（属于其组 / super），返回所属组用于审计
async function assertNode(session: Session, id: string): Promise<Group> {
  const node = await getNode(id)
  return groupForNode(session, node)
}

export async function renameNodeAction(
  id: string,
  newName: string,
): Promise<ActionResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  const name = newName.trim()
  if (!name) return { ok: false, error: t('nodeNameRequired') }
  // headscale 节点名规则：字母数字和连字符
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    return { ok: false, error: t('nodeNamePattern') }
  }
  try {
    const group = await assertNode(session, id)
    await renameNode(id, name)
    await audit('node.rename', id, name, { groupId: group.id, actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function expireNodeAction(id: string): Promise<ActionResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  try {
    const group = await assertNode(session, id)
    await expireNode(id)
    await audit('node.expire', id, undefined, { groupId: group.id, actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function deleteNodeAction(id: string): Promise<ActionResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  try {
    const group = await assertNode(session, id)
    await deleteNode(id)
    await audit('node.delete', id, undefined, { groupId: group.id, actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function saveNoteAction(
  id: string,
  note: string,
): Promise<ActionResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  if (note.length > 200) return { ok: false, error: t('noteTooLong') }
  try {
    const group = await assertNode(session, id)
    setNodeNote(id, note)
    await audit('node.note', id, note.trim() || t('noteCleared'), {
      groupId: group.id,
      actor: session.sub,
    })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}
