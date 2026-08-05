// 常量与类型放在不带 'use client' 的文件里：客户端模块只向服务端暴露组件引用，
// 从中导入普通值在服务端会得到 undefined（曾因此在 dashboard 上抛
// "ACTIVITY_KEYS is not iterable"）。
export const ACTIVITY_KEYS = ['node', 'route', 'group', 'key', 'auth'] as const

export type ActivityKey = (typeof ACTIVITY_KEYS)[number]

export type ActivityPoint = { date: string; total: number } & Record<
  ActivityKey,
  number
>

/** 16 种具体动作按前缀收成 5 个大类 */
export function activityCategory(action: string): ActivityKey {
  if (action.startsWith('node.')) return 'node'
  if (action.startsWith('route.') || action.startsWith('policy.')) return 'route'
  if (action.startsWith('group.')) return 'group'
  if (action.startsWith('preauthkey.') || action.startsWith('accesskey.'))
    return 'key'
  return 'auth'
}
