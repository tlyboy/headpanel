// 常量与类型放在不带 'use client' 的文件里：客户端模块只向服务端暴露组件引用，
// 从中导入普通值在服务端会得到 undefined（曾因此在 dashboard 上抛
// "ACTIVITY_KEYS is not iterable"）。

/** 悬停卡片里最多列几行明细，其余并入「其他」 */
export const ACTIVITY_TOP_N = 6

/** 按性质分档：这三档是状态而不是三个并列系列，所以用状态色 */
export const ACTIVITY_KINDS = ['normal', 'destructive', 'failed'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

// 审计只在操作成功后落库，显式记失败的就 .fail / ...Failed 两类命名。
// 破坏性按动词认：删除、撤销、拒绝、使失效——这些出错了要能一眼找到是哪天。
export function activityKind(action: string): ActivityKind {
  if (action.endsWith('.fail') || action.endsWith('Failed')) return 'failed'
  if (/(delete|revoke|reject|expire)/i.test(action)) return 'destructive'
  return 'normal'
}

export interface ActivityItem {
  label: string
  count: number
  kind: ActivityKind
}

export interface ActivityPoint {
  /** YYYY-MM-DD */
  date: string
  normal: number
  destructive: number
  failed: number
  total: number
  /** 当天各动作的次数，已翻译、已按次数降序、已截断 */
  items: ActivityItem[]
}
