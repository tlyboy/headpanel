'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Boxes, Check, ChevronsUpDown, Layers } from 'lucide-react'
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

export interface SwitchableGroup {
  id: number
  name: string
  slug: string
}

// 只给 super 用：把整个面板的视图收敛到某一个组，或切回全部。
// 选中状态存在 cookie 里，由服务端在每次渲染时校验，这里只负责触发。
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
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={pending}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <span className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                {active ? <Boxes /> : <Layers />}
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">
                  {active ? active.name : productName}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {active ? active.slug : t('allGroups')}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {t('label')}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
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
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {t('hint')}
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
