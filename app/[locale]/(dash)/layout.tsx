import { getTranslations } from 'next-intl/server'
import { requireRealSession, requireSession } from '@/lib/auth'
import { visibleGroups } from '@/lib/groups'
import { isHeadscaleHostControlEnabled } from '@/lib/headscale-config'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [session, real, t] = await Promise.all([
    requireSession(),
    requireRealSession(),
    getTranslations('common'),
  ])
  // The sidebar determines menu visibility based on the "downgraded" identity, keeping it consistent with page permissions;
  // but the switcher itself must be attached to the "real" identity, or it disappears after switching into a group.
  const isSuper = session.role === 'super'
  const realIsSuper = real.role === 'super'
  const groups = visibleGroups(real)
  const hostControl = isHeadscaleHostControlEnabled()
  const scopeLabel = isSuper
    ? t('superAdmin')
    : (groups[0]?.name ?? t('unknown'))

  return (
    <SidebarProvider>
      <AppSidebar
        username={session.sub}
        scopeLabel={scopeLabel}
        isSuper={isSuper}
        hostControl={hostControl}
        productName={t('productName')}
        showSwitcher={realIsSuper}
        groups={groups.map((g) => ({ id: g.id, name: g.name, slug: g.slug }))}
        activeGroupId={session.impersonating ? session.gid : null}
      />
      <SidebarInset className="h-svh overflow-hidden">
        <DashboardHeader />
        <div className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
