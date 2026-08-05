'use client'

import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export interface ActivityPoint {
  /** YYYY-MM-DD */
  date: string
  count: number
}

// 单序列：图例省掉，标题已经说明这是什么。
// 用柱不用线：每天是一个离散的计数桶，线会暗示天与天之间存在中间值。
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const t = useTranslations('dashboard')

  const config = {
    count: {
      label: t('activityCount'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig

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
          // 轴上只留 月-日，年份对 30 天的窗口是噪音
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
          content={<ChartTooltipContent labelFormatter={(l) => String(l)} />}
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
