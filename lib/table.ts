// Pin the actions column to the right side of the table: when there are many columns, you have to scroll horizontally, and actions like "Rename / Delete" are what you scroll over for,
// so they shouldn't scroll out of view.
//
// TableHead / TableCell have no background by default. Making them sticky directly lets the content below show through,
// so add bg-background explicitly.
//
// Don't put the translucent hover color directly on this cell: bg-muted/50 is semi-transparent, so hovering a fixed column
// lets content scroll past show through immediately. Instead, layer a pseudo-element on top—it has a negative z-index,
// so by stacking rules it renders above the element's own background but below its content. This keeps the background opaque
// while matching the row's hover appearance. Use with the group/row on TableRow in ui/table.tsx.
const STICKY_BASE =
  'sticky right-0 z-10 border-l bg-background ' +
  'after:pointer-events-none after:absolute after:inset-0 after:-z-10 ' +
  'group-hover/row:after:bg-muted/50'

// Set a fixed width instead of letting the content determine it: the header is empty, and sizing based on content makes the action column vary in width across pages,
// so the position of that fixed column on the right also changes while scrolling horizontally. min-w is key—the table defaults to
// table-layout:auto, and w alone will be overridden by the content.
/** Action column with a single ... menu */
export const STICKY_ACTIONS = `w-14 min-w-14 text-center ${STICKY_BASE}`
/** Approval column wide enough for two buttons (Approve / Reject on the pending approvals page) */
export const STICKY_ACTIONS_WIDE = `w-40 min-w-40 text-right ${STICKY_BASE}`
