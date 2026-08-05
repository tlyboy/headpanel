'use client'

import { useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
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

// 筛选状态放 URL 而不是组件内：页面都是 RSC + force-dynamic，筛选在服务端做，
// 顺带白得可分享的链接和能用的前进后退。
export function ListFilters({
  placeholder,
  selects = [],
  clearLabel,
}: {
  placeholder: string
  selects?: FilterSelect[]
  clearLabel: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  // 输入框不受控：URL 才是唯一真相。key 跟着 URL 的 q 变，
  // 前进/后退时组件重新挂载，defaultValue 自然回到该有的值。
  const urlQ = params.get('q') ?? ''

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

  const active = urlQ !== '' || selects.some((s) => params.get(s.name))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          const v = new FormData(e.currentTarget).get('q')
          setParam('q', String(v ?? '').trim())
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          key={urlQ}
          name="q"
          defaultValue={urlQ}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v !== urlQ) setParam('q', v)
          }}
          placeholder={placeholder}
          className="w-56 pl-8"
        />
      </form>

      {selects.map((s) => (
        <Select
          key={s.name}
          value={params.get(s.name) ?? '__all'}
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

      {active && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => start(() => router.replace(pathname))}
        >
          <X />
          {clearLabel}
        </Button>
      )}
    </div>
  )
}
