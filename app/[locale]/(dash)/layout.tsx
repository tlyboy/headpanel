import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { isHeadscaleHostControlEnabled } from '@/lib/headscale-config'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Suspense fallback={<Sidebar collapsible="icon" />}>
        <SessionSidebar />
      </Suspense>
      <SidebarInset className="h-svh overflow-hidden">
        <DashboardHeader />
        <div className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

// The username comes from the session cookie and hostControl from runtime env, so this part renders per request.
async function SessionSidebar() {
  const [session, t] = await Promise.all([requireSession(), getTranslations('common')])
  const hostControl = isHeadscaleHostControlEnabled()

  return (
    <AppSidebar username={session.sub} hostControl={hostControl} productName={t('productName')} />
  )
}
