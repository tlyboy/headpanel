'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { listGroups } from '@/lib/groups'
import {
  addSubnetDst,
  removeSubnetDst,
  updateBaselineAndApply,
} from '@/lib/policy'
import {
  approveRoutes,
  getNode,
  listNodes,
  HeadscaleError,
} from '@/lib/headscale'

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
    // 批准只是让 headscale 认这条路由；ACL 的 dst 不含该网段的话包照样被丢，
    // 所以顺手把它放通——否则用户还得 SSH 上服务器改基线文件。
    try {
      if (await updateBaselineAndApply(addSubnetDst(route), listGroups())) {
        auditAfter('policy.allowSubnet', route, undefined, { actor: session.sub })
      }
    } catch (e) {
      // 路由已经批准成功了，不因为 ACL 没跟上就把它回滚——如实告知即可
      return { ok: false, error: t('routeApprovedAclFailed', { reason: errMsg(e, t('unknown')) }) }
    }
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
    // 只有当这条网段再没有任何节点批准时才收回 ACL——还有备份节点的话
    // 收回等于把仍在服务的网段掐了
    try {
      const nodes = await listNodes()
      const stillApproved = nodes.some((n) =>
        (n.approvedRoutes ?? []).includes(route),
      )
      if (
        !stillApproved &&
        (await updateBaselineAndApply(removeSubnetDst(route), listGroups()))
      ) {
        auditAfter('policy.revokeSubnet', route, undefined, { actor: session.sub })
      }
    } catch (e) {
      return { ok: false, error: t('routeRevokedAclFailed', { reason: errMsg(e, t('unknown')) }) }
    }
    revalidatePath('/subnets')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}

// headscale 自己挑 primary，选定后除非失效不会变，也没有 CLI/API 能直接指定。
// 唯一的办法是把其它已批准节点暂时撤掉，逼它切到目标，再把它们恢复成备份。
//
// 两个要点：
//  1. 撤销时传的是「去掉这条路由后的剩余全集」，不是空数组——approve_routes 收全集，
//     传空会连带删掉该节点其它网段的批准。
//  2. 恢复放在 finally 里。中途任何一步失败，已撤掉的备份都必须还原，
//     否则冗余会被静默吃掉，而且没人会发现。
export async function makePrimaryAction(
  route: string,
  targetNodeId: string,
): Promise<RouteResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  const revoked: { id: string; routes: string[] }[] = []
  try {
    const nodes = await listNodes()
    const approved = nodes.filter((n) =>
      (n.approvedRoutes ?? []).includes(route),
    )
    const target = approved.find((n) => n.id === targetNodeId)
    if (!target) return { ok: false, error: t('routeNotApproved') }
    if ((target.subnetRoutes ?? []).includes(route)) return { ok: true }

    const others = approved.filter((n) => n.id !== targetNodeId)
    for (const n of others) {
      const original = n.approvedRoutes ?? []
      await approveRoutes(
        n.id,
        original.filter((r) => r !== route),
      )
      revoked.push({ id: n.id, routes: original })
    }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  } finally {
    for (const r of revoked) {
      // 恢复失败只能记审计——此时抛错会盖掉真正的失败原因
      await approveRoutes(r.id, r.routes).catch(() => {
        auditAfter('route.restoreFailed', `${r.id}:${route}`, undefined, {
          actor: session.sub,
        })
      })
    }
  }

  // 确认真的切过去了，而不是嘴上说成功
  try {
    const after = await listNodes()
    const now = after.find((n) => (n.subnetRoutes ?? []).includes(route))
    if (now?.id !== targetNodeId) {
      return { ok: false, error: t('primaryNotSwitched') }
    }
    auditAfter('route.makePrimary', `${targetNodeId}:${route}`, undefined, {
      actor: session.sub,
    })
    revalidatePath('/subnets')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
