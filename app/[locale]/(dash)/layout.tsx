import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { visibleGroups } from '@/lib/groups'
import { SidebarNav } from '@/components/sidebar-nav'
import { MobileNav } from '@/components/mobile-nav'
import { ModeToggle } from '@/components/mode-toggle'
import { LanguageToggle } from '@/components/language-toggle'
import { Button } from '@/components/ui/button'
import { logout } from './actions'

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  const t = await getTranslations('common')
  const isSuper = session.role === 'super'
  // 组管理员顶栏显示其组名；超管显示「超管」
  const scopeLabel = isSuper
    ? t('superAdmin')
    : (visibleGroups(session)[0]?.name ?? t('unknown'))

  return (
    <div className="flex h-svh overflow-hidden">
      {/* 桌面端固定侧边栏；移动端隐藏，改用 header 里的抽屉 */}
      <aside className="bg-sidebar hidden w-56 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center border-b px-4 font-semibold">
          {t('productName')}
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav isSuper={isSuper} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <div className="md:hidden">
            <MobileNav isSuper={isSuper} />
          </div>
          <span className="font-semibold md:hidden">
            {t('productName')}
          </span>
          <div className="flex-1" />
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {session.sub} · {scopeLabel}
          </span>
          <LanguageToggle />
          <ModeToggle />
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              {t('signOut')}
            </Button>
          </form>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
