import { Cpu, HelpCircle, Monitor, Server, Smartphone, type LucideIcon } from 'lucide-react'
import type { ResolvedKind } from '@/lib/device-kind'

const ICONS: Record<ResolvedKind, LucideIcon> = {
  server: Server,
  pc: Monitor,
  phone: Smartphone,
  iot: Cpu,
  unknown: HelpCircle,
}

export function DeviceKindIcon({ kind, className }: { kind: ResolvedKind; className?: string }) {
  const Icon = ICONS[kind]
  return <Icon aria-hidden className={className} />
}
