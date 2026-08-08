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

// headscale's ipAddresses can contain IPv4 and IPv6 in any order; only display IPv4 in the UI.
export function pickIpv4(ips?: string[]): string | undefined {
  return ips?.find((ip) => ip.includes('.'))
}

export function onlyIpv4(ips?: string[]): string[] {
  return ips?.filter((ip) => ip.includes('.')) ?? []
}
