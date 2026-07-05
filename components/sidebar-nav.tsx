'use client'

import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  Server,
  ClockAlert,
  KeyRound,
  Boxes,
  Download,
  type LucideIcon,
  ScrollText,
  Network,
} from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

// superOnly 的项仅超管可见
type NavLabel =
  | 'dashboard'
  | 'nodes'
  | 'pending'
  | 'preauthKeys'
  | 'groups'
  | 'network'
  | 'scripts'
  | 'audit'

type NavHref =
  | '/dashboard'
  | '/nodes'
  | '/pending'
  | '/preauthkeys'
  | '/groups'
  | '/network'
  | '/scripts'
  | '/audit'

interface NavItem {
  href: NavHref
  label: NavLabel
  icon: LucideIcon
  superOnly?: boolean
}

const items: NavItem[] = [
  { href: '/dashboard', label: 'dashboard', icon: LayoutDashboard },
  { href: '/nodes', label: 'nodes', icon: Server },
  { href: '/pending', label: 'pending', icon: ClockAlert },
  { href: '/preauthkeys', label: 'preauthKeys', icon: KeyRound },
  { href: '/groups', label: 'groups', icon: Boxes, superOnly: true },
  { href: '/network', label: 'network', icon: Network, superOnly: true },
  { href: '/scripts', label: 'scripts', icon: Download },
  { href: '/audit', label: 'audit', icon: ScrollText },
]

export function SidebarNav({ isSuper = false }: { isSuper?: boolean }) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  return (
    <nav className="flex flex-col gap-1 p-2">
      {items
        .filter((it) => isSuper || !it.superOnly)
        .map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {t(label)}
            </Link>
          )
        })}
    </nav>
  )
}
