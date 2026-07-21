'use client'

import { CableIcon } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { SidebarNav } from '@/components/sidebar-nav'
import { SidebarUserMenu } from '@/components/sidebar-user-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

export function AppSidebar({
  username,
  scopeLabel,
  isSuper,
  hostControl,
  productName,
}: {
  username: string
  scopeLabel: string
  isSuper: boolean
  hostControl: boolean
  productName: string
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/dashboard">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CableIcon />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{productName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    headscale
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav isSuper={isSuper} hostControl={hostControl} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserMenu username={username} scopeLabel={scopeLabel} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
