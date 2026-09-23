'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { routeTarget } from '@/lib/audit'
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
  type HsNode,
} from '@/lib/headscale'

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
): Promise<{ node: HsNode; before: string[]; after: string[] }> {
  const node = await getNode(nodeId)
  const before = node.approvedRoutes ?? []
  const next = approved
    ? before.includes(route)
      ? before
      : [...before, route]
    : before.filter((r) => r !== route)
  if (next.length !== before.length) await approveRoutes(nodeId, next)
  return { node, before, after: next }
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
    const { node, after } = await setRouteApproval(nodeId, route, true)
    auditAfter(
      'route.approve',
      routeTarget(node, route),
      `approved=${after.join(',')}`,
      {
        actor: session.sub,
      },
    )
    // Approving a route only tells headscale to recognize it; if the ACL's dst doesn't include that subnet, packets will still be dropped,
    // so allow it at the same time — otherwise users would have to SSH into the server and edit the baseline file.
    try {
      if (await updateBaselineAndApply(addSubnetDst(route), listGroups())) {
        auditAfter('policy.allowSubnet', route, undefined, {
          actor: session.sub,
        })
      }
    } catch (e) {
      // The route has already been approved successfully. Don't roll it back just because the ACL wasn't updated — simply report that accurately.
      return {
        ok: false,
        error: t('routeApprovedAclFailed', { reason: errMsg(e, t('unknown')) }),
      }
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
    const { node, after } = await setRouteApproval(nodeId, route, false)
    auditAfter(
      'route.revoke',
      routeTarget(node, route),
      `approved=${after.join(',')}`,
      {
        actor: session.sub,
      },
    )
    // Revoke the ACL only when no nodes have this subnet approved anymore — if there are backup nodes,
    // revoking it would cut off a subnet that's still in service.
    try {
      const nodes = await listNodes()
      const stillApproved = nodes.some((n) =>
        (n.approvedRoutes ?? []).includes(route),
      )
      if (
        !stillApproved &&
        (await updateBaselineAndApply(removeSubnetDst(route), listGroups()))
      ) {
        auditAfter('policy.revokeSubnet', route, undefined, {
          actor: session.sub,
        })
      }
    } catch (e) {
      return {
        ok: false,
        error: t('routeRevokedAclFailed', { reason: errMsg(e, t('unknown')) }),
      }
    }
    revalidatePath('/subnets')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}

// headscale chooses the primary itself. Once selected, it won't change unless it fails, and there's no CLI/API to specify one directly.
// The only way is to temporarily revoke the other approved nodes, forcing it to switch to the target, then restore them as backups.
//
// Two key points:
//  1. When revoking, pass the full set remaining after removing this route, not an empty array — approve_routes takes the full set,
//     and passing an empty array would also remove approvals for the node's other subnets.
//  2. Put restoration in finally. If any step fails midway, all revoked backups must be restored,
//     otherwise redundancy will be silently lost and no one will notice.
export async function makePrimaryAction(
  route: string,
  targetNodeId: string,
): Promise<RouteResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  const revoked: { node: HsNode; routes: string[] }[] = []
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
      revoked.push({ node: n, routes: original })
    }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  } finally {
    for (const r of revoked) {
      // If restoration fails, all we can do is log it for the audit — throwing here would mask the actual failure reason.
      await approveRoutes(r.node.id, r.routes).catch(() => {
        auditAfter(
          'route.restoreFailed',
          routeTarget(r.node, route),
          undefined,
          {
            actor: session.sub,
          },
        )
      })
    }
  }

  // Confirm that the switch actually happened, rather than just claiming success.
  try {
    const after = await listNodes()
    const now = after.find((n) => (n.subnetRoutes ?? []).includes(route))
    if (now?.id !== targetNodeId) {
      return { ok: false, error: t('primaryNotSwitched') }
    }
    auditAfter('route.makePrimary', routeTarget(now, route), undefined, {
      actor: session.sub,
    })
    revalidatePath('/subnets')
    revalidatePath('/nodes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
