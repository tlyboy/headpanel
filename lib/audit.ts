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

/**
 * 审计「对象」列里的节点写法：节点名 + ID。只记 ID 的话日志里就剩一串数字，
 * 看不出是哪台机器；只记名字又会在节点改名后对不上号，所以两个都留。
 */
export function nodeTarget(node: { id: string; givenName: string }) {
  return `${node.givenName} (#${node.id})`
}

/** 子网路由相关的对象：哪台节点上的哪个网段 */
export function routeTarget(
  node: { id: string; givenName: string },
  route: string,
) {
  return `${nodeTarget(node)} ${route}`
}

// 旧记录的对象只有节点 ID（node.* 记成 "65"，route.* 记成 "65:10.0.0.0/24"）。
// 展示时按当前节点列表补上名字；节点已删除、查不到名字的，原样显示。
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
