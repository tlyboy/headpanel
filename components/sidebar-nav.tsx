'use client'

import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  Server,
  KeyRound,
  type LucideIcon,
  ScrollText,
  Route,
  Settings,
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

type NavLabel = 'dashboard' | 'nodes' | 'preauthKeys' | 'tags' | 'subnets' | 'audit' | 'network'

type NavHref =
  | '/dashboard'
  | '/nodes'
  | '/preauthkeys'
  | '/tags'
  | '/subnets'
  | '/audit'
  | '/network'

interface NavItem {
  href: NavHref
  label: NavLabel
  icon: LucideIcon
  hostControlOnly?: boolean
}

// Daily work first; the rarely touched network and system pages sit in their own group below
const sections: { label: 'daily' | 'system'; items: NavItem[] }[] = [
  {
    label: 'daily',
    items: [
      { href: '/dashboard', label: 'dashboard', icon: LayoutDashboard },
      { href: '/nodes', label: 'nodes', icon: Server },
      { href: '/preauthkeys', label: 'preauthKeys', icon: KeyRound },
      { href: '/tags', label: 'tags', icon: Tags },
    ],
  },
  {
    label: 'system',
    items: [
      { href: '/subnets', label: 'subnets', icon: Route },
      { href: '/audit', label: 'audit', icon: ScrollText },
      { href: '/network', label: 'network', icon: Settings, hostControlOnly: true },
    ],
  },
]

export function SidebarNav({ hostControl = false }: { hostControl?: boolean }) {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return sections.map((section) => (
    <SidebarGroup key={section.label}>
      <SidebarGroupLabel>{t(section.label)}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {section.items
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
  ))
}
