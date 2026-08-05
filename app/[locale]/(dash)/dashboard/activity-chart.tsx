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

// Single series: omit the legend; the title already explains what this is.
// Use bars, not a line: each day is a discrete count bucket, and a line would suggest intermediate values between days.
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
          // Show only month-day on the axis; the year is noise in a 30-day window
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
