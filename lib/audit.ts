/**
 * Audit action severity tiers. Chart colors and audit list badges share the same rules to avoid inconsistent standards.
 *
 * The tiers are ordered by "what would you look for after something goes wrong": deletions and failures are equally serious, so both use red;
 * approvals allow something through, so use yellow to check whether anything was approved by mistake; config changes use blue; other successfully completed actions use green.
 */
export const AUDIT_KINDS = ['success', 'update', 'approve', 'danger'] as const
export type AuditKind = (typeof AUDIT_KINDS)[number]

// Order is priority: failures come first (login.fail also contains login), followed by destructive actions.
// Audits are written only after successful operations; failures are explicitly logged using the .fail / ...Failed naming patterns,
// so the fallback is success rather than a neutral tier.
export function auditKind(action: string): AuditKind {
  if (/(\.fail|Failed)$/.test(action)) return 'danger'
  if (/(delete|revoke|reject|expire)/i.test(action)) return 'danger'
  if (/(approve|allow)/i.test(action)) return 'approve'
  if (/(rename|note|update|reset|primary|set)/i.test(action)) return 'update'
  return 'success'
}

/** Badge variants for each tier, shared by the list and hover card */
export const AUDIT_KIND_VARIANT = {
  success: 'success',
  update: 'info',
  approve: 'warning',
  danger: 'destructive',
} as const satisfies Record<AuditKind, string>

/** Color variables for each tier, shared by chart segments and the hover card's color dots */
export const AUDIT_KIND_COLOR: Record<AuditKind, string> = {
  success: 'var(--success)',
  update: 'var(--info)',
  approve: 'var(--warning)',
  danger: 'var(--destructive)',
}

/**
 * Node format in the audit "object" column: node name + ID. If only the ID is recorded, the log is left with just a string of numbers,
 * making it unclear which machine it refers to; if only the name is recorded, it won't match after the node is renamed, so keep both.
 */
export function nodeTarget(node: { id: string; givenName: string }) {
  return `${node.givenName} (#${node.id})`
}

/** Object for subnet routes: which subnet on which node */
export function routeTarget(
  node: { id: string; givenName: string },
  route: string,
) {
  return `${nodeTarget(node)} ${route}`
}

// Older records only have the node ID as the object (node.* is recorded as "65", route.* as "65:10.0.0.0/24").
// When displaying them, add the name from the current node list; if the node has been deleted and its name can't be found, display the original value.
const LEGACY_NODE_TARGET = /^(\d+)$/
const LEGACY_ROUTE_TARGET = /^(\d+):(.+)$/

export function legacyNodeId(action: string, target: string | null) {
  if (!target) return null
  if (action.startsWith('node.'))
    return LEGACY_NODE_TARGET.exec(target)?.[1] ?? null
  if (action.startsWith('route.'))
    return LEGACY_ROUTE_TARGET.exec(target)?.[1] ?? null
  return null
}

export function displayTarget(
  action: string,
  target: string | null,
  nodeNames: ReadonlyMap<string, string>,
) {
  const id = legacyNodeId(action, target)
  const name = id ? nodeNames.get(id) : undefined
  if (!target || !id || !name) return target
  const node = { id, givenName: name }
  if (action.startsWith('route.')) {
    return routeTarget(node, LEGACY_ROUTE_TARGET.exec(target)![2])
  }
  return nodeTarget(node)
}
