// 操作列固定在表格右侧：列一多就得横向滚动，而「改名 / 删除」这些是滚过去的目的，
// 不该跟着滚出视野。
//
// TableHead / TableCell 默认没有背景色，直接 sticky 会让下层内容从底下透上来，
// 所以要自己补 bg-background。
//
// hover 的淡色不能直接写在这个格子上：bg-muted/50 是半透明的，一 hover 固定列就
// 跟着透，横向滚过去的内容立刻从底下冒出来。改成叠一层伪元素——它带负 z-index，
// 按层叠规则画在元素自身背景之上、内容之下，于是底色始终不透明，视觉上又和
// 整行的 hover 一致。配 ui/table.tsx 里 TableRow 的 group/row 使用。
const STICKY_BASE =
  'sticky right-0 z-10 border-l bg-background ' +
  'after:pointer-events-none after:absolute after:inset-0 after:-z-10 ' +
  'group-hover/row:after:bg-muted/50'

// 宽度写死而不是让内容撑：表头已经空了，靠内容定宽会让各页的操作列宽窄不一，
// 横向滚动时右侧那条固定列的位置也跟着页面变。min-w 是关键——表格默认
// table-layout:auto，只给 w 会被内容挤开。
/** 单个 ... 菜单的操作列 */
export const STICKY_ACTIONS = `w-14 min-w-14 text-center ${STICKY_BASE}`
/** 放得下两个按钮的审批列（待审批页的批准 / 拒绝） */
export const STICKY_ACTIONS_WIDE = `w-40 min-w-40 text-right ${STICKY_BASE}`
