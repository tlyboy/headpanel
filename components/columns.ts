// Keep types and pure functions in a file without 'use client': client modules expose only component references to the server,
// and importing regular values from them on the server yields undefined (this once caused
// "ACTIVITY_KEYS is not iterable" on the dashboard). Server pages need parseHidden to read cookies,
// and client dropdowns need the same cookie name and serialization, so both sides share this module.

/** Column visibility is stored in a cookie, not the URL: it's a long-term personal preference and shouldn't clutter shareable links.
 *  Not httpOnly; the client writes it directly, and the server reads it back during rendering — so the table renders only visible columns from the start,
 *  without briefly showing all columns before hiding some. Same approach as the sidebar_state in the sidebar. */
export const COLUMN_COOKIE_PREFIX = 'cols_'
export const COLUMN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface ColumnDef {
  /** Identifiers stored in the cookie; renaming one resets the user's existing selection */
  key: string
  label: string
  /** Columns that cannot be hidden, such as the actions column, are omitted from the dropdown */
  locked?: boolean
}

export function columnCookieName(page: string): string {
  return `${COLUMN_COOKIE_PREFIX}${page}`
}

/** The cookie stores the [hidden] columns, not the visible ones — so existing users will see new columns by default */
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

/** Check during rendering whether a column is visible. Locked columns ignore the cookie and are always shown */
export function makeIsVisible(
  columns: ColumnDef[],
  hidden: Set<string>,
): (key: string) => boolean {
  const locked = new Set(columns.filter((c) => c.locked).map((c) => c.key))
  return (key) => locked.has(key) || !hidden.has(key)
}

/** The colSpan on the table's empty-state row must track the number of visible columns, or it will be misaligned */
export function visibleCount(
  columns: ColumnDef[],
  hidden: Set<string>,
): number {
  const isVisible = makeIsVisible(columns, hidden)
  return columns.filter((c) => isVisible(c.key)).length
}
