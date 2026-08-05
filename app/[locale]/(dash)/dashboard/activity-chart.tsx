'use client'

import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { AUDIT_KINDS, AUDIT_KIND_COLOR, type AuditKind } from '@/lib/audit'
import { type ActivityPoint } from './activity'

// Bar height shows "how much happened that day," segmented by type: deletions and failures should be instantly recognizable,
// but they are states, not peer series, so use status colors. Specific actions go in the hover card—on 30 bars,
// there's no room to distinguish a dozen kinds of actions, and "what happened that day" is something you only want to know when you stop on a day.
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const t = useTranslations('dashboard')

  const label: Record<AuditKind, string> = {
    success: t('kindSuccess'),
    update: t('kindUpdate'),
    approve: t('kindApprove'),
    danger: t('kindDanger'),
  }
  const config = Object.fromEntries(
    AUDIT_KINDS.map((k) => [k, { label: label[k], color: AUDIT_KIND_COLOR[k] }]),
  ) satisfies ChartConfig

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
          // In a 30-day window, the year is noise
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
          content={({ active, payload, label: day }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as ActivityPoint
            if (!d.total) return null
            return (
              <div className="border-border/50 bg-background grid min-w-48 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                <div className="flex items-center justify-between gap-4 font-medium">
                  <span>{String(day)}</span>
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
                      {/* The color dot carries the identity; keep the text in the standard ink color—two colored elements on one line would compete */}
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-[2px]"
                          style={{ background: AUDIT_KIND_COLOR[it.kind] }}
                        />
                        <span className="text-muted-foreground">
                          {it.label}
                        </span>
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
        {AUDIT_KINDS.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="a"
            fill={`var(--color-${k})`}
            // Round only the topmost segment; rounding the middle ones would leave gaps between segments
            radius={i === AUDIT_KINDS.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
