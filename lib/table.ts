// 操作列固定在表格右侧：列一多就得横向滚动，而「改名 / 删除」这些是滚过去的目的，
// 不该跟着滚出视野。
//
// 三个坑，缺一不可：
//
// 1. TableHead / TableCell 默认没有背景色，直接 sticky 会让下层内容从底下透上来，
//    所以要自己补 bg-background。
// 2. 左侧那条分隔线不能用 border-l 画。表格是 border-collapse: collapse，
//    collapse 模式下边框归属表格而不是单元格，于是 sticky 单元格粘住了、它的边框
//    却留在原地跟着表格滚走。改用 before 伪元素画一条 1px，它属于单元格本身。
// 3. hover 的淡色也不能直接写在这个格子上：bg-muted/50 是半透明的，一 hover
//    固定列就跟着透，横向滚过去的内容立刻从底下冒出来。改成 after 伪元素叠一层，
//    它带负 z-index，按层叠规则画在元素自身背景之上、内容之下，于是底色始终
//    不透明，视觉上又和整行的 hover 一致。配 ui/table.tsx 里 TableRow 的
//    group/row 使用。
//
// 宽度写死：表头已经空了，靠内容定宽会让各页的操作列宽窄不一，横向滚动时右侧
// 那条固定列的位置也跟着页面变。前提是每页的操作列都只放一个 ⋯ 菜单——一旦塞进
// 并排的行内按钮，列宽就由「动作最多的那一行」决定，写多少都压不住。
export const STICKY_ACTIONS = [
  'w-14 min-w-14 text-center',
  'sticky right-0 z-10 bg-background',
  'before:pointer-events-none before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-border',
  'after:pointer-events-none after:absolute after:inset-0 after:-z-10 group-hover/row:after:bg-muted/50',
].join(' ')
