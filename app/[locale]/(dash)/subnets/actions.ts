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

// headscale 的 approve_routes 收的是「批准后应有的全集」而非增量，所以这里必须
// 先读当前已批准列表，再在其上增删——直接传单条会把该节点其它已批准的路由抹掉。
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
