'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

// 列表页已经没有 h1 了，面包屑是唯一的页面标识——漏一个路由就会静默显示成
// 「概览」，看不出自己在哪一页。新增页面记得同步这张表。
const routeKeys = {
  dashboard: 'dashboard',
  nodes: 'nodes',
  pending: 'pending',
  preauthkeys: 'preauthKeys',
  groups: 'groups',
  network: 'network',
  scripts: 'scripts',
  audit: 'audit',
  subnets: 'subnets',
} as const

export function DashboardHeader() {
  const pathname = usePathname()
  const nav = useTranslations('nav')
  const common = useTranslations('common')
  const segment = pathname.split('/').filter(Boolean)[0] ?? 'dashboard'
  const key = routeKeys[segment as keyof typeof routeKeys] ?? 'dashboard'

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <Link href="/dashboard">{common('productName')}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{nav(key)}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
