'use client'

import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { type ActivityPoint } from './activity'

// 柱高表达「那天动了多少」，按性质分段：删除这类破坏性操作和失败要能一眼认出，
// 它们是状态而非并列系列，所以用状态色。具体动作放悬停卡片——30 根柱上
// 分不出十几种动作，而「那天都做了什么」本来就是停在某天才想知道的。
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const t = useTranslations('dashboard')

  const config = {
    normal: { label: t('kindNormal'), color: 'var(--chart-1)' },
    destructive: { label: t('kindDestructive'), color: 'var(--destructive)' },
    failed: { label: t('kindFailed'), color: 'var(--warning)' },
  } satisfies ChartConfig

  const kindClass = {
    normal: 'text-muted-foreground',
    destructive: 'text-destructive',
    failed: 'text-warning',
  } as const

  return (
    <ChartContainer config={config} className="h-40 w-full">
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
            return (
              <div className="border-border/50 bg-background grid min-w-48 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                <div className="flex items-center justify-between gap-4 font-medium">
                  <span>{String(label)}</span>
                  <span className="font-mono tabular-nums">
                    {t('activityTotal', { count: d.total })}
                  </span>
                </div>
                <div className="grid gap-1">
                  {d.items.map((it) => (
                    <div
                      key={it.label}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className={kindClass[it.kind]}>
                        {it.label}
                      </span>
                      <span className="text-foreground font-mono tabular-nums">
                        {it.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }}
        />
        <Legend content={<ChartLegendContent />} verticalAlign="bottom" />
        <Bar
          dataKey="normal"
          stackId="a"
          fill="var(--color-normal)"
          radius={0}
        />
        <Bar
          dataKey="destructive"
          stackId="a"
          fill="var(--color-destructive)"
          radius={0}
        />
        <Bar
          dataKey="failed"
          stackId="a"
          fill="var(--color-failed)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
