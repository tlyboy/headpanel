'use client'

import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  Server,
  ClockAlert,
  KeyRound,
  Download,
  type LucideIcon,
  ScrollText,
  Network,
  Route,
  Tags,
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

type NavLabel =
  | 'dashboard'
  | 'nodes'
  | 'pending'
  | 'preauthKeys'
  | 'subnets'
  | 'tags'
  | 'network'
  | 'scripts'
  | 'audit'

type NavHref =
  | '/dashboard'
  | '/nodes'
  | '/pending'
  | '/preauthkeys'
  | '/subnets'
  | '/tags'
  | '/network'
  | '/scripts'
  | '/audit'

interface NavItem {
  href: NavHref
  label: NavLabel
  icon: LucideIcon
  hostControlOnly?: boolean
}

const items: NavItem[] = [
  { href: '/dashboard', label: 'dashboard', icon: LayoutDashboard },
  { href: '/nodes', label: 'nodes', icon: Server },
  { href: '/pending', label: 'pending', icon: ClockAlert },
  { href: '/preauthkeys', label: 'preauthKeys', icon: KeyRound },
  { href: '/tags', label: 'tags', icon: Tags },
  { href: '/subnets', label: 'subnets', icon: Route },
  {
    href: '/network',
    label: 'network',
    icon: Network,
    hostControlOnly: true,
  },
  { href: '/scripts', label: 'scripts', icon: Download },
  { href: '/audit', label: 'audit', icon: ScrollText },
]

export function SidebarNav({ hostControl = false }: { hostControl?: boolean }) {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('platform')}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items
            .filter((item) => hostControl || !item.hostControlOnly)
            .map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)

              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={t(label)}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{t(label)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
