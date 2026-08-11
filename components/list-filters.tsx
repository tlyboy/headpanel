'use client'

import { useRef, useTransition, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RotateCcw, Search } from 'lucide-react'
import { usePathname, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface FilterSelect {
  /** URL 参数名 */
  name: string
  /** 未选中时显示的占位 */
  placeholder: string
  /** value 为空串表示「全部」 */
  options: { value: string; label: string }[]
}

// 每个列表页顶部的那一条：左边是筛选与操作，右边是列显隐。
// 筛选状态放 URL 而不是组件内：页面都是 RSC + force-dynamic，筛选在服务端做，
// 顺带白得可分享的链接和能用的前进后退。
// 不传 placeholder 就不渲染搜索区（那几个页面本来就没有可筛的东西），
// 这条工具栏仍然存在，用来放操作按钮和列筛选——六个列表页长一个样。
export function ListFilters({
  placeholder,
  selects = [],
  actions,
  columns,
}: {
  placeholder?: string
  selects?: FilterSelect[]
  /** 页面级操作按钮，新增排在最前 */
  actions?: ReactNode
  /** 右侧的列筛选下拉 */
  columns?: ReactNode
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  // 输入框不受控：URL 才是唯一真相。key 跟着 URL 的 q 变，
  // 前进/后退时组件重新挂载，defaultValue 自然回到该有的值。
  const urlQ = params.get('q') ?? ''
  const searchable = placeholder != null

  function push(next: URLSearchParams) {
    // 任何筛选变化都要回到第一页，否则会停在一个已经不存在的页码上
    next.delete('page')
    const qs = next.toString()
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname))
  }

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(name, value)
    else next.delete(name)
    push(next)
  }

  function submitSearch() {
    const v = inputRef.current?.value.trim() ?? ''
    if (v !== urlQ) setParam('q', v)
  }

  return (
    <div className="flex items-start justify-between gap-2">
      {/* 左组自己换行，列筛选始终贴右——否则窄屏下它会跟着换到下一行的最左边 */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {searchable && (
          <>
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault()
                submitSearch()
              }}
            >
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                key={urlQ}
                ref={inputRef}
                name="q"
                defaultValue={urlQ}
                // 失焦即筛选：按钮只是多给一个显式入口，习惯回车或直接点走的人不受影响
                onBlur={submitSearch}
                placeholder={placeholder}
                className="w-56 pl-8"
              />
            </form>

            {selects.map((s) => (
              <Select
                key={s.name}
                // 未筛选时传 undefined 而不是 __all：Radix 只有在没有选中值时
                // 才显示 placeholder，恒定给个哨兵值会让触发器变成一片空白
                value={params.get(s.name) ?? undefined}
                onValueChange={(v) => setParam(s.name, v === '__all' ? '' : v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={s.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">{s.placeholder}</SelectItem>
                  {s.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}

            <Button disabled={pending} onClick={submitSearch}>
              <Search />
              {t('search')}
            </Button>
            {/* 常驻且随时可点：出现又消失会让后面的按钮左右跳，而按不动的按钮
                同样要人先判断「现在到底能不能点」——没筛选时点一下回到原样即可 */}
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => start(() => router.replace(pathname))}
            >
              <RotateCcw />
              {t('reset')}
            </Button>
          </>
        )}

        {actions}
      </div>

      {columns}
    </div>
  )
}
