'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { nodeTarget } from '@/lib/audit'
import { auditAfter } from '@/lib/db'
import { approvedTag, defaultHsUserName } from '@/lib/default-zone'
import { listNodes, setNodeTags, HeadscaleError } from '@/lib/headscale'
import { addTag, declaredTags, removeTag, updateBaselineAndApply } from '@/lib/policy'

export interface ActionResult {
  ok: boolean
  error?: string
}

function fail(e: unknown, unknownMessage: string): ActionResult {
  if (e instanceof HeadscaleError) return { ok: false, error: e.message }
  return { ok: false, error: e instanceof Error ? e.message : unknownMessage }
}

function done(): ActionResult {
  revalidatePath('/tags')
  revalidatePath('/nodes')
  return { ok: true }
}

export async function createTagAction(name: string): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  const bare = name.trim().toLowerCase().replace(/^tag:/, '')
  const tag = `tag:${bare}`
  try {
    if (!(await updateBaselineAndApply(addTag(tag, `${defaultHsUserName()}@`)))) {
      return { ok: false, error: t('tagExists') }
    }
    auditAfter('tag.create', tag, undefined, { actor: session.sub })
    return done()
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
    if (used.length) {
      return { ok: false, error: t('tagInUse', { count: used.length }) }
    }
    if (await updateBaselineAndApply(removeTag(tag))) {
      auditAfter('tag.delete', tag, undefined, { actor: session.sub })
    }
    return done()
  } catch (e) {
    return fail(e, t('unknown'))
  }
}

// Put exactly these devices in the tag: add it where missing, take it off the rest
export async function setMembersAction(tag: string, ids: string[]): Promise<ActionResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  if (!declaredTags().includes(tag)) return { ok: false, error: t('tagUnknown') }
  try {
    const want = new Set(ids)
    const changes = (await listNodes())
      .filter((n) => want.has(n.id) !== n.tags.includes(tag))
      .map((n) => ({
        node: n,
        next: want.has(n.id) ? [...n.tags, tag].sort() : n.tags.filter((x) => x !== tag),
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
    return done()
  } catch (e) {
    return fail(e, t('unknown'))
  }
}
