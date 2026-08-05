'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { useCopy } from '@/lib/use-copy'

// 一台机器常报上来好几个局域网地址（真实网卡 + docker/WSL/VMware 虚拟网卡），
// 表格里只放打分最高的那个，其余收进悬浮卡片。用 HoverCard 而非原生 title：
// 地址是拿去用的，得能移进去逐条复制。
export function LanIpCell({ ips }: { ips: string[] }) {
  const t = useTranslations('nodes')
  const { copy } = useCopy()
  const [copiedIp, setCopiedIp] = useState<string | null>(null)

  function pick(ip: string) {
    copy(ip)
    setCopiedIp(ip)
    window.setTimeout(() => setCopiedIp((c) => (c === ip ? null : c)), 1500)
  }

  if (ips.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  const [primary, ...rest] = ips

  return (
    <HoverCard openDelay={100} closeDelay={200}>
      <HoverCardTrigger asChild>
        <button type="button" className="cursor-default font-mono">
          {primary}
          {rest.length > 0 && (
            <span className="text-muted-foreground ml-1">+{rest.length}</span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-auto min-w-56">
        <div className="flex flex-col gap-1">
            {ips.map((ip, i) => (
              <div key={ip} className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs select-all">
                  {ip}
                </code>
                {i === 0 && ips.length > 1 && (
                  <Badge variant="secondary">{t('lanIpPrimary')}</Badge>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('copyLanIp')}
                  onClick={() => pick(ip)}
                >
                  {copiedIp === ip ? <Check /> : <Copy />}
                </Button>
              </div>
            ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
