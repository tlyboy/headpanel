'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { nodeTarget } from '@/lib/audit'
import { auditAfter } from '@/lib/db'
import { declaredTags } from '@/lib/policy'
import { setNodeNote } from '@/lib/nodes-sync'
import {
  deleteNode,
  expireNode,
  getNode,
  renameNode,
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

export async function renameNodeAction(id: string, newName: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  const name = newName.trim()
  if (!name) return { ok: false, error: t('nodeNameRequired') }
  // headscale node name rules: alphanumeric characters and hyphens
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    return { ok: false, error: t('nodeNamePattern') }
  }
  try {
    const node = await getNode(id)
    await renameNode(id, name)
    auditAfter('node.rename', nodeTarget(node), name, { actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function expireNodeAction(id: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  try {
    const node = await getNode(id)
    await expireNode(id)
    auditAfter('node.expire', nodeTarget(node), undefined, { actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function deleteNodeAction(id: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  try {
    const node = await getNode(id)
    await deleteNode(id)
    auditAfter('node.delete', nodeTarget(node), undefined, { actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function saveNoteAction(id: string, note: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  if (note.length > 200) return { ok: false, error: t('noteTooLong') }
  try {
    const node = await getNode(id)
    setNodeNote(id, note)
    auditAfter('node.note', nodeTarget(node), note.trim() || t('noteCleared'), {
      actor: session.sub,
    })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

// headscale replaces the whole set; a tagged node
// can't go back to having none, so at least one tag stays.
export async function setTagsAction(id: string, tags: string[]): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  const known = new Set(declaredTags())
  const next = [...new Set(tags)].sort()
  if (!next.length) return { ok: false, error: t('tagsRequired') }
  if (next.some((tag) => !known.has(tag))) return { ok: false, error: t('tagUnknown') }
  try {
    const node = await getNode(id)
    await setNodeTags(id, next)
    auditAfter('node.setTags', nodeTarget(node), `${node.tags.join(',')} → ${next.join(',')}`, {
      actor: session.sub,
    })
    revalidatePath('/nodes')
    revalidatePath('/tags')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}
