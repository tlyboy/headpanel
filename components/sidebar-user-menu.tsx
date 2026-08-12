'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import {
  ChevronsUpDownIcon,
  ContrastIcon,
  LanguagesIcon,
  LogOutIcon,
} from 'lucide-react'
import { siGithub } from 'simple-icons'
import { logout } from '@/app/[locale]/(dash)/actions'
import { usePathname, useRouter } from '@/i18n/navigation'
import { toggleThemeWithTransition } from '@/lib/theme-transition'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

// 英文在上、中文在下
const locales = ['en', 'zh'] as const

export function SidebarUserMenu({
  username,
  scopeLabel,
}: {
  username: string
  scopeLabel: string
}) {
  const { isMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const common = useTranslations('common')
  const themeText = useTranslations('theme')
  const languageText = useTranslations('language')
  const fallback = username.slice(0, 2).toUpperCase() || 'HP'

  function switchLocale(nextLocale: (typeof locales)[number]) {
    const href = `${pathname}${window.location.search}${window.location.hash}`
    router.replace(href, { locale: nextLocale })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {fallback}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-medium">{username}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {scopeLabel}
                </span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <span className="flex items-center gap-2">
                <Avatar className="rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {fallback}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-medium">{username}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {scopeLabel}
                  </span>
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LanguagesIcon />
                  {languageText('toggle')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={locale}
                    onValueChange={(value) =>
                      switchLocale(value as (typeof locales)[number])
                    }
                  >
                    {locales.map((item) => (
                      <DropdownMenuRadioItem key={item} value={item}>
                        {languageText(item)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {/* 明暗直接对切，不做二级菜单也不给「跟随系统」：这是一天里会点
                  好几次的开关，多一层展开就多一次等待，而那圈扩散动画也只有在
                  点击处才有意义 */}
              <DropdownMenuItem
                onClick={(e) =>
                  toggleThemeWithTransition(e, resolvedTheme, setTheme)
                }
              >
                <ContrastIcon />
                {themeText('toggle')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://github.com/tlyboy/headpanel"
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg
                    aria-hidden="true"
                    fill="currentColor"
                    role="img"
                    viewBox="0 0 24 24"
                  >
                    <path d={siGithub.path} />
                  </svg>
                  GitHub
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem asChild variant="destructive">
                <button type="submit" className="w-full">
                  <LogOutIcon />
                  {common('signOut')}
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
