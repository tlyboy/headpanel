'use client'

import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/lib/use-copy'

export function CmdBlock({ label, cmd }: { label: string; cmd: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-start gap-2">
        <code className="bg-muted max-h-28 min-w-0 flex-1 overflow-y-auto rounded px-2 py-1.5 font-mono text-xs break-all whitespace-pre-wrap">
          {cmd}
        </code>
        <Button size="icon" variant="outline" onClick={() => copy(cmd)}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
