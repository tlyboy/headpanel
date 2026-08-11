'use client'

import { useCallback, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SlidersHorizontal } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  COLUMN_COOKIE_MAX_AGE,
  columnCookieName,
  serializeHidden,
  type ColumnDef,
} from '@/components/columns'

export function ColumnFilter({
  page,
  columns,
  hidden: initialHidden,
}: {
  /** cookie 名的后缀，每个列表页一个 */
  page: string
  columns: ColumnDef[]
  /** 服务端读到的已隐藏列，作为初值 */
  hidden: string[]
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  // 本地先改，让勾选立刻有反馈；服务端重渲染回来后两边一致
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden))

  const toggleable = columns.filter((c) => !c.locked)
  const visibleCount = toggleable.filter((c) => !hidden.has(c.key)).length

  // 与 ui/sidebar.tsx 写 sidebar_state 同一写法：包进 useCallback，
  // 否则 React Compiler 的 immutability 规则会拦下对 document.cookie 的赋值
  const toggle = useCallback(
    (key: string, next: boolean) => {
      setHidden((prev) => {
        const draft = new Set(prev)
        if (next) draft.delete(key)
        else draft.add(key)
        document.cookie = `${columnCookieName(page)}=${serializeHidden(draft)}; path=/; max-age=${COLUMN_COOKIE_MAX_AGE}; samesite=lax`
        return draft
      })
      // 表格在服务端渲染，改完 cookie 要让 RSC 重新跑一遍才会真的增减列
      start(() => router.refresh())
    },
    [page, router],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <SlidersHorizontal />
          {t('columns')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {toggleable.map((c) => {
          const checked = !hidden.has(c.key)
          return (
            <DropdownMenuCheckboxItem
              key={c.key}
              checked={checked}
              // 全部隐藏会得到一张空表，留最后一列不给取消
              disabled={checked && visibleCount <= 1}
              onCheckedChange={(v) => toggle(c.key, v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
