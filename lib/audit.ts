/**
 * 审计动作的性质分档。图表配色、审计列表徽标共用同一套判定，避免两处标准漂移。
 *
 * 分档按「出事后你会去找什么」排：删除和失败是同一类要紧事，都用红；
 * 审批是放行，要看一眼有没有放错，用黄；改配置用蓝；其余正常完成的操作用绿。
 */
export const AUDIT_KINDS = ['success', 'update', 'approve', 'danger'] as const
export type AuditKind = (typeof AUDIT_KINDS)[number]

// 顺序即优先级：失败先于一切（login.fail 里也有 login），破坏性次之。
// 审计只在操作成功后落库，显式记失败的就 .fail / ...Failed 两类命名，
// 所以兜底落在 success 而不是某个中性档。
export function auditKind(action: string): AuditKind {
  if (/(\.fail|Failed)$/.test(action)) return 'danger'
  if (/(delete|revoke|reject|expire)/i.test(action)) return 'danger'
  if (/(approve|allow)/i.test(action)) return 'approve'
  if (/(rename|note|update|reset|primary|set)/i.test(action)) return 'update'
  return 'success'
}

/** 各档对应的 Badge 变体，列表与悬停卡片共用 */
export const AUDIT_KIND_VARIANT = {
  success: 'success',
  update: 'info',
  approve: 'warning',
  danger: 'destructive',
} as const satisfies Record<AuditKind, string>

/** 各档对应的色值变量，图表分段与悬停卡片的色点共用 */
export const AUDIT_KIND_COLOR: Record<AuditKind, string> = {
  success: 'var(--success)',
  update: 'var(--info)',
  approve: 'var(--warning)',
  danger: 'var(--destructive)',
}
