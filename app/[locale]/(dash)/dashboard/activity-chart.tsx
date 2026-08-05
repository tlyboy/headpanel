'use client'

import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'

import {
  ACTIVITY_KEYS,
  type ActivityKey as Key,
  type ActivityPoint,
} from './activity'

// 柱只表达「那天动了多少」，构成放进悬停卡片：
// 一根柱同时承担趋势和构成，30 天 × 5 类会糊成一片，而「那天都做了什么」
// 本来就是停在某一天时才想知道的。
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const t = useTranslations('dashboard')

  const config = {
    total: { label: t('activityCount'), color: 'var(--chart-1)' },
  } satisfies ChartConfig

  const catLabel: Record<Key, string> = {
    node: t('catNode'),
    route: t('catRoute'),
    group: t('catGroup'),
    key: t('catKey'),
    auth: t('catAuth'),
  }

  return (
    <ChartContainer config={config} className="h-full w-full">
      <BarChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          // 30 天的窗口里年份是噪音
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as ActivityPoint
            if (!d.total) return null
            const parts = ACTIVITY_KEYS.filter((k) => d[k] > 0)
            return (
              <div className="border-border/50 bg-background grid min-w-40 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                <div className="flex items-center justify-between gap-4 font-medium">
                  <span>{String(label)}</span>
                  <span className="font-mono tabular-nums">
                    {t('activityTotal', { count: d.total })}
                  </span>
                </div>
                <div className="grid gap-1">
                  {parts.map((k) => (
                    <div
                      key={k}
                      className="text-muted-foreground flex items-center justify-between gap-4"
                    >
                      <span>{catLabel[k]}</span>
                      <span className="text-foreground font-mono tabular-nums">
                        {d[k]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }}
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
