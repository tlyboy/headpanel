// Keep constants in a file without 'use client': client modules expose only component references to the server,
// and importing ordinary values from them on the server returns undefined. Server pages use this to calculate the offset,
// while the client pager uses it to render the dropdown; both sides share it.

/** Options for items per page; the first is the default (the default is not written to the URL) */
export const PER_PAGE_OPTIONS = [20, 50, 100] as const

/** Normalize the URL's per parameter to one of the allowed options, preventing manual edits to 999999 from bogging down the query */
export function resolvePerPage(raw: string | undefined): number {
  const n = Number(raw)
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n)
    ? n
    : PER_PAGE_OPTIONS[0]
}
