'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { createGrant, deleteGrant, parseEndpoint, type Grant } from '@/lib/grants'
import { HeadscaleError } from '@/lib/headscale'
import { PolicyReadOnlyError } from '@/lib/policy'

export interface GrantResult {
  ok: boolean
  error?: string
}

export interface EndpointInput {
  kind: string
  ref: string | null
}

type ActionErrorT = Awaited<ReturnType<typeof getTranslations<'actionErrors'>>>

function errMsg(e: unknown, t: ActionErrorT): string {
  if (e instanceof PolicyReadOnlyError) return t('policyReadOnly')
  if (e instanceof HeadscaleError) return e.message
  return e instanceof Error ? e.message : t('unknown')
}

// Refs only: names change and groups or nodes get deleted, but the audit entry should still say what was granted
function describe(g: Grant): string {
  const side = (e: Grant['src']) =>
    e.kind === 'zone' ? 'zone' : e.kind === 'group' ? `group#${e.groupId}` : `node#${e.nodeId}`
  return `${side(g.src)} -> ${side(g.dst)} ports=${g.ports}`
}

export async function createGrantAction(input: {
  src: EndpointInput
  dst: EndpointInput
  ports: string
  note: string
}): Promise<GrantResult> {
  const [session, t] = await Promise.all([requireSuper(), getTranslations('actionErrors')])
  try {
    const grant = await createGrant({
      src: parseEndpoint(input.src.kind, input.src.ref),
      dst: parseEndpoint(input.dst.kind, input.dst.ref),
      ports: input.ports,
      note: input.note,
    })
    auditAfter('grant.create', `#${grant.id}`, describe(grant), { actor: session.sub })
    revalidatePath('/access')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t) }
  }
}

export async function deleteGrantAction(id: number): Promise<GrantResult> {
  const [session, t] = await Promise.all([requireSuper(), getTranslations('actionErrors')])
  try {
    const grant = await deleteGrant(id)
    auditAfter('grant.delete', `#${grant.id}`, describe(grant), { actor: session.sub })
    revalidatePath('/access')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t) }
  }
}
