'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { nodeTarget } from '@/lib/audit'
import { auditAfter } from '@/lib/db'
import { addTag, declaredTags, removeTag, updateBaselineAndApply } from '@/lib/policy'
import { approvedTag, defaultHsUserName } from '@/lib/default-zone'
import { setNodeNote, setNodeStatus } from '@/lib/nodes-sync'
import {
  deleteNode,
  expireNode,
  getNode,
  listNodes,
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
// Approve with the tags picked in the dialog, so a new device lands in the right place in one step
export async function approveNodeAction(id: string, tags: string[]): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  const known = new Set(declaredTags())
  const next = [...new Set(tags)].sort()
  if (!next.length) return { ok: false, error: t('tagsRequired') }
  if (next.some((tag) => !known.has(tag))) return { ok: false, error: t('tagUnknown') }
  try {
    const node = await getNode(id)
    await setNodeTags(id, next)
    setNodeStatus(id, 'approved', session.sub)
    auditAfter('node.approve', nodeTarget(node), `tags=[${next.join(',')}]`, { actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

// Reject: delete the node so its IP is reclaimed; the client has to join again
export async function rejectNodeAction(id: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  try {
    const node = await getNode(id)
    setNodeStatus(id, 'rejected', session.sub)
    await deleteNode(id)
    auditAfter('node.reject', nodeTarget(node), 'deleted', { actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

// Add one tag to, or take it off, every selected device
export async function bulkTagAction(
  ids: string[],
  tag: string,
  mode: 'add' | 'remove',
): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  if (!declaredTags().includes(tag)) return { ok: false, error: t('tagUnknown') }
  try {
    const want = new Set(ids)
    const changes = (await listNodes())
      .filter((n) => want.has(n.id) && n.tags.includes(tag) !== (mode === 'add'))
      .map((n) => ({
        node: n,
        next: mode === 'add' ? [...n.tags, tag].sort() : n.tags.filter((x) => x !== tag),
      }))
    // headscale can't take the last tag off a node, so refuse before changing anything
    const stuck = changes.filter((c) => !c.next.length)
    if (stuck.length) {
      return {
        ok: false,
        error: t('lastTag', { names: stuck.map((c) => c.node.givenName).join(', ') }),
      }
    }
    for (const { node, next } of changes) {
      await setNodeTags(node.id, next)
      auditAfter('node.setTags', nodeTarget(node), `${node.tags.join(',')} → ${next.join(',')}`, {
        actor: session.sub,
      })
    }
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function createTagAction(name: string): Promise<ActionResult & { tag?: string }> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  const tag = `tag:${name.trim().toLowerCase().replace(/^tag:/, '')}`
  try {
    if (!(await updateBaselineAndApply(addTag(tag, `${defaultHsUserName()}@`)))) {
      return { ok: false, error: t('tagExists') }
    }
    auditAfter('tag.create', tag, undefined, { actor: session.sub })
    revalidatePath('/nodes')
    return { ok: true, tag }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

export async function deleteTagAction(tag: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  // Approval puts this tag on every new node; without it approval would fail
  if (tag === approvedTag()) return { ok: false, error: t('tagIsDefault') }
  try {
    const used = (await listNodes()).filter((n) => n.tags.includes(tag))
    if (used.length) return { ok: false, error: t('tagInUse', { count: used.length }) }
    if (await updateBaselineAndApply(removeTag(tag))) {
      auditAfter('tag.delete', tag, undefined, { actor: session.sub })
    }
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}
