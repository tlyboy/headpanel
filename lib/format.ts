// 时间格式化（client/server 通用，勿加 server-only）

export function fmtTime(s?: string): string {
  if (!s || s.startsWith('0001-01-01')) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}

export function isNever(s?: string): boolean {
  return !s || s.startsWith('0001-01-01')
}

// headscale 的 ipAddresses 是 IPv4 + IPv6 混排且顺序不保证，界面上只展示 IPv4。
export function pickIpv4(ips?: string[]): string | undefined {
  return ips?.find((ip) => ip.includes('.'))
}

export function onlyIpv4(ips?: string[]): string[] {
  return ips?.filter((ip) => ip.includes('.')) ?? []
}
