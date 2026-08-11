// Pin the actions column to the right side of the table: when there are many columns, you have to scroll horizontally, and actions like "Rename / Delete" are what you scroll over for,
// so they shouldn't scroll out of view.
//
// Three pitfalls, and all three matter:
//
// 1. TableHead / TableCell have no background color by default. If you make them sticky as-is, content underneath shows through,
//    so you need to add bg-background yourself.
// 2. You can't draw the divider on the left with border-l. The table uses border-collapse: collapse,
//    and in collapse mode, borders belong to the table rather than the cells. So the sticky cell stays put, but its border
//    stays behind and scrolls away with the table. Use a before pseudo-element to draw a 1px line instead; it belongs to the cell itself.
// 3. You can't put the translucent hover color directly on this cell either: bg-muted/50 is semi-transparent, so when you hover,
//    the fixed column becomes see-through and the horizontally scrolled content immediately shows through underneath. Use an after pseudo-element as an overlay,
//    with a negative z-index. According to the stacking rules, it renders above the element's own background and below its content, so the background stays
//    opaque while still looking consistent with the hover state of the whole row. Use it with the
//    group/row on TableRow in ui/table.tsx.
//
// Use a fixed width: the header is already empty, and sizing to content would make the actions column vary in width from page to page, so the position of the fixed column on the right
// would also vary between pages when scrolling horizontally. This assumes each page's actions column contains only a ⋯ menu — as soon as you add
// inline buttons side by side, the column width is determined by the row with the most actions, and no fixed width can keep it in check.
export const STICKY_ACTIONS = [
  'w-14 min-w-14 text-center',
  'sticky right-0 z-10 bg-background',
  'before:pointer-events-none before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-border',
  'after:pointer-events-none after:absolute after:inset-0 after:-z-10 group-hover/row:after:bg-muted/50',
].join(' ')
