// Time formatting (shared by client and server; do not add server-only)

export function fmtTime(s?: string): string {
  if (!s || s.startsWith('0001-01-01')) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}

export function isNever(s?: string): boolean {
  return !s || s.startsWith('0001-01-01')
}
