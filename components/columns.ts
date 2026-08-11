// 类型与纯函数放在不带 'use client' 的文件里：客户端模块只向服务端暴露组件引用，
// 从中导入普通值在服务端会得到 undefined（曾因此在 dashboard 上抛
// "ACTIVITY_KEYS is not iterable"）。服务端页面要用 parseHidden 读 cookie，
// 客户端下拉要用同一套 cookie 名和序列化，所以两边共用这个模块。

/** 列显隐记 cookie 而不是 URL：这是长期的个人偏好，不该污染可分享的链接。
 *  非 httpOnly，客户端直接写、服务端渲染时读回——表格一开始就只渲染可见列，
 *  不会先闪一下全部列再收起来。与侧边栏的 sidebar_state 同一套路。 */
export const COLUMN_COOKIE_PREFIX = 'cols_'
export const COLUMN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface ColumnDef {
  /** cookie 里存的标识，改名等于重置用户已有的选择 */
  key: string
  label: string
  /** 操作列这类不允许隐藏的列，不进下拉 */
  locked?: boolean
}

export function columnCookieName(page: string): string {
  return `${COLUMN_COOKIE_PREFIX}${page}`
}

/** cookie 里存的是【被隐藏】的列，不是可见列——这样新增一列时老用户默认能看见它 */
export function parseHidden(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    decodeURIComponent(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

export function serializeHidden(hidden: Set<string>): string {
  return encodeURIComponent([...hidden].join(','))
}

/** 渲染期判断某列是否显示。locked 的列无视 cookie，永远显示 */
export function makeIsVisible(
  columns: ColumnDef[],
  hidden: Set<string>,
): (key: string) => boolean {
  const locked = new Set(columns.filter((c) => c.locked).map((c) => c.key))
  return (key) => locked.has(key) || !hidden.has(key)
}

/** 表格空态那一行的 colSpan 要跟着可见列数走，否则会串位 */
export function visibleCount(
  columns: ColumnDef[],
  hidden: Set<string>,
): number {
  const isVisible = makeIsVisible(columns, hidden)
  return columns.filter((c) => isVisible(c.key)).length
}
