import {
  Box,
  Boxes,
  Cctv,
  CircleHelp,
  CircuitBoard,
  Factory,
  HardDrive,
  Laptop,
  Monitor,
  Printer,
  Radio,
  Router,
  Server,
  Smartphone,
  Tablet,
  type LucideIcon,
} from 'lucide-react'
import type { ResolvedKind } from '@/lib/device-kind'

const ICONS: Record<ResolvedKind, LucideIcon> = {
  server: Server,
  vm: Boxes,
  nas: HardDrive,
  desktop: Monitor,
  laptop: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  router: Router,
  camera: Cctv,
  printer: Printer,
  sbc: CircuitBoard,
  iot: Radio,
  industrial: Factory,
  other: Box,
  unset: CircleHelp,
}

export function DeviceKindIcon({ kind, className }: { kind: ResolvedKind; className?: string }) {
  const Icon = ICONS[kind]
  return <Icon aria-hidden className={className} />
}
