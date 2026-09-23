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

// English on top, Chinese below
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
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="rounded-lg">
              <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-medium">{username}</span>
              <span className="truncate text-xs text-muted-foreground">
                {scopeLabel}
              </span>
            </span>
            <ChevronsUpDownIcon className="ml-auto" />
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
              {/* Switch directly between light and dark mode, with no submenu or "Follow system" option: this is a toggle people
                  use several times a day, and adding another level means another pause. The ripple animation also only matters at the
                  point of the click.
                  closeOnClick={false} disables the menu item's default "close on click" behavior: this is a toggle, not a navigation item,
                  so closing the menu means having to reopen it every time you want to check the effect. Also, the transition takes a snapshot of the entire page,
                  so the screen will appear to jitter if the menu disappears midway through the animation */}
              <DropdownMenuItem
                closeOnClick={false}
                onClick={(e) =>
                  toggleThemeWithTransition(e, resolvedTheme, setTheme)
                }
              >
                <ContrastIcon />
                {themeText('toggle')}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <a
                    href="https://github.com/tlyboy/headpanel"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
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
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem
                variant="destructive"
                nativeButton
                render={<button type="submit" className="w-full" />}
              >
                <LogOutIcon />
                {common('signOut')}
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
