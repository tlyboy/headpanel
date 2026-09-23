'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Boxes, Check, ChevronsUpDown, Layers, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { setActiveGroupAction } from '@/app/[locale]/(dash)/actions'
import { CreateGroup } from '@/app/[locale]/(dash)/groups/group-form'

export interface SwitchableGroup {
  id: number
  name: string
  slug: string
}

// For super only: narrow the entire panel view to a single group, or switch back to all groups.
// The selection is stored in a cookie and validated by the server on every render; this only triggers the change.
export function GroupSwitcher({
  groups,
  activeId,
  productName,
}: {
  groups: SwitchableGroup[]
  activeId: number | null
  productName: string
}) {
  const t = useTranslations('groupSwitcher')
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)

  const active = groups.find((g) => g.id === activeId) ?? null

  function pick(id: number | null) {
    if (id === activeId) return
    start(async () => {
      await setActiveGroupAction(id)
      router.refresh()
    })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                disabled={pending}
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              {active ? <Boxes /> : <Layers />}
            </span>
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-semibold">
                {active ? active.name : productName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {active ? t('actingAs') : t('allGroups')}
              </span>
            </span>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {/* Base UI's Label must be placed inside Group; putting it outside causes the entire menu to throw an error. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('label')}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => pick(null)} className="gap-2">
                <Layers />
                <span className="flex-1">{t('allGroups')}</span>
                {activeId === null && <Check />}
              </DropdownMenuItem>
              {groups.map((g) => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => pick(g.id)}
                  className="gap-2"
                >
                  <Boxes />
                  <span className="flex-1 truncate">{g.name}</span>
                  {activeId === g.id && <Check />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus />
              <span className="text-muted-foreground">{t('addGroup')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Must be rendered outside DropdownMenu: clicking a menu item closes it, and the dialog would be unmounted before it can open. */}
        <CreateGroup
          open={createOpen}
          onOpenChange={setCreateOpen}
          hideTrigger
        />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
