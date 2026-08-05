// 常量与类型放在不带 'use client' 的文件里：客户端模块只向服务端暴露组件引用，
// 从中导入普通值在服务端会得到 undefined（曾因此在 dashboard 上抛
// "ACTIVITY_KEYS is not iterable"）。
import { type AuditKind } from '@/lib/audit'

/** 悬停卡片里最多列几行明细，其余并入「其他」 */
export const ACTIVITY_TOP_N = 6

export interface ActivityItem {
  label: string
  count: number
  kind: AuditKind
}

// 每档一个数值字段，堆叠柱按 AUDIT_KINDS 的顺序自下而上画
export type ActivityPoint = Record<AuditKind, number> & {
  /** YYYY-MM-DD */
  date: string
  total: number
  /** 当天各动作的次数，已翻译、已按次数降序、已截断 */
  items: ActivityItem[]
}
