// 常量放在不带 'use client' 的文件里：客户端模块只向服务端暴露组件引用，
// 从中导入普通值在服务端会得到 undefined。服务端页面要用它算 offset，
// 客户端分页器要用它渲染下拉，两边共用。

/** 每页条数选项，第一个是默认值（默认值不写进 URL） */
export const PER_PAGE_OPTIONS = [20, 50, 100] as const

/** 把 URL 上的 per 参数归一到允许的选项里，防止手改成 999999 拖垮查询 */
export function resolvePerPage(raw: string | undefined): number {
  const n = Number(raw)
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n)
    ? n
    : PER_PAGE_OPTIONS[0]
}
