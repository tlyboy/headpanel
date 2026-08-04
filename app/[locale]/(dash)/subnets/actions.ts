'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { approveRoutes, getNode, HeadscaleError } from '@/lib/headscale'

export interface RouteResult {
  ok: boolean
  error?: string
}

function errMsg(e: unknown, unknownMessage: string): string {
  if (e instanceof HeadscaleError) return e.message
  return e instanceof Error ? e.message : unknownMessage
}

// headscale's approve_routes takes the full set of routes that should be approved, not a delta, so we must
// read the current approved list first, then add or remove routes from it — passing a single route directly would wipe out the node's other approved routes.
async function setRouteApproval(
  nodeId: string,
  route: string,
  approved: boolean,
): Promise<{ before: string[]; after: string[] }> {
  const node = await getNode(nodeId)
  const before = node.approvedRoutes ?? []
  const next = approved
    ? before.includes(route)
      ? before
      : [...before, route]
    : before.filter((r) => r !== route)
  if (next.length !== before.length) await approveRoutes(nodeId, next)
  return { before, after: next }
}

export async function approveRouteAction(
  nodeId: string,
  route: string,
): Promise<RouteResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  try {
    const { after } = await setRouteApproval(nodeId, route, true)
    auditAfter('route.approve', `${nodeId}:${route}`, `approved=${after.join(',')}`, {
      actor: session.sub,
    })
    revalidatePath('/subnets')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}

export async function revokeRouteAction(
  nodeId: string,
  route: string,
): Promise<RouteResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  try {
    const { after } = await setRouteApproval(nodeId, route, false)
    auditAfter('route.revoke', `${nodeId}:${route}`, `approved=${after.join(',')}`, {
      actor: session.sub,
    })
    revalidatePath('/subnets')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
