import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { isHeadscaleHostControlEnabled } from '@/lib/headscale-config'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([requireSession(), getTranslations('common')])
  const hostControl = isHeadscaleHostControlEnabled()

  return (
    <SidebarProvider>
      <AppSidebar username={session.sub} hostControl={hostControl} productName={t('productName')} />
      <SidebarInset className="h-svh overflow-hidden">
        <DashboardHeader />
        <div className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
