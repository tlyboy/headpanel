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

// 柱高表达「那天动了多少」，按性质分段：删除和失败要能一眼认出，
// 它们是状态而非并列系列，所以用状态色。具体动作放悬停卡片——30 根柱上
// 分不出十几种动作，而「那天都做了什么」本来就是停在某天才想知道的。
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
                      {/* 色点带身份，文字保持常规墨色——一行里两处上色会互相打架 */}
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
            // 只有最上面一段收圆角，中间收会在段间留出豁口
            radius={i === AUDIT_KINDS.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
