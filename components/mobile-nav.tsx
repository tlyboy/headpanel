'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { SidebarNav } from './sidebar-nav'

export function MobileNav({
  isSuper = false,
  hostControl = false,
}: {
  isSuper?: boolean
  hostControl?: boolean
}) {
  const [open, setOpen] = useState(false)
  const nav = useTranslations('nav')
  const common = useTranslations('common')
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={nav('menu')}
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 gap-0 p-0">
        <SheetTitle className="flex h-14 items-center border-b px-4 font-semibold">
          {common('productName')}
        </SheetTitle>
        {/* 点任意导航项后冒泡到此处关闭抽屉 */}
        <div className="overflow-y-auto" onClick={() => setOpen(false)}>
          <SidebarNav isSuper={isSuper} hostControl={hostControl} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
