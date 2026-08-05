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
