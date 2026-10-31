'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TagChecklist } from '@/components/tag-checklist'
import { fmtTime } from '@/lib/format'
import { useResetOnHide } from '@/lib/use-reset-on-hide'
import { approveNodeAction, rejectNodeAction } from './actions'

export interface PendingNode {
  id: string
  name: string
  ip: string
  createdAt: string
}

function PendingRow({
  node,
  tagOptions,
  defaultTag,
}: {
  node: PendingNode
  tagOptions: string[]
  defaultTag: string
}) {
  const t = useTranslations('pending')
  const common = useTranslations('common')
  const [busy, start] = useTransition()
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  useResetOnHide(() => {
    setApproveOpen(false)
    setRejectOpen(false)
  })
  const [picked, setPicked] = useState([defaultTag])

  function approve() {
    start(async () => {
      const r = await approveNodeAction(node.id, picked)
      if (r.ok) {
        toast.success(t('approved', { name: node.name }))
        setApproveOpen(false)
      } else toast.error(r.error ?? common('operationFailed'))
    })
  }

  function reject() {
    start(async () => {
      const r = await rejectNodeAction(node.id)
      if (r.ok) {
        toast.success(t('rejected', { name: node.name }))
        setRejectOpen(false)
      } else toast.error(r.error ?? common('operationFailed'))
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{node.name}</span>
        <span className="text-xs text-muted-foreground">
          <span className="font-mono">{node.ip}</span> ·{' '}
          {t('joinedAt', { time: fmtTime(node.createdAt) })}
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setApproveOpen(true)} disabled={busy}>
          {t('approve')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
          {t('reject')}
        </Button>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('approveTitle', { name: node.name })}</DialogTitle>
            <DialogDescription>{t('approveDescription')}</DialogDescription>
          </DialogHeader>
          <TagChecklist options={tagOptions} picked={picked} onChange={setPicked} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={busy}>
              {common('cancel')}
            </Button>
            <Button onClick={approve} disabled={busy || !picked.length}>
              {busy ? common('processing') : t('approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rejectTitle', { name: node.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('rejectDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{common('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                reject()
              }}
            >
              {busy ? common('processing') : t('confirmReject')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function PendingCard({
  nodes,
  tagOptions,
  defaultTag,
}: {
  nodes: PendingNode[]
  tagOptions: string[]
  defaultTag: string
}) {
  const t = useTranslations('pending')
  return (
    <Card className="border-warning/50">
      <CardHeader>
        <CardTitle>{t('title', { count: nodes.length })}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y border-t">
          {nodes.map((n) => (
            <PendingRow key={n.id} node={n} tagOptions={tagOptions} defaultTag={defaultTag} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
