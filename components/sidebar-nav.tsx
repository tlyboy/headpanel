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
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

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
  hostControlOnly?: boolean
}

const items: NavItem[] = [
  { href: '/dashboard', label: 'dashboard', icon: LayoutDashboard },
  { href: '/nodes', label: 'nodes', icon: Server },
  { href: '/pending', label: 'pending', icon: ClockAlert },
  { href: '/preauthkeys', label: 'preauthKeys', icon: KeyRound },
  { href: '/groups', label: 'groups', icon: Boxes, superOnly: true },
  {
    href: '/network',
    label: 'network',
    icon: Network,
    superOnly: true,
    hostControlOnly: true,
  },
  { href: '/scripts', label: 'scripts', icon: Download },
  { href: '/audit', label: 'audit', icon: ScrollText },
]

export function SidebarNav({
  isSuper = false,
  hostControl = false,
}: {
  isSuper?: boolean
  hostControl?: boolean
}) {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('platform')}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items
            .filter(
              (item) =>
                (isSuper || !item.superOnly) &&
                (hostControl || !item.hostControlOnly),
            )
            .map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`)

              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={t(label)}
                  >
                    <Link href={href}>
                      <Icon />
                      <span>{t(label)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
