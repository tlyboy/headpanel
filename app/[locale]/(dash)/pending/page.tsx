import { getTranslations } from 'next-intl/server'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { requireSession } from '@/lib/auth'
import { scopeNodes } from '@/lib/groups'
import { fmtTime } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PendingRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

export default async function PendingPage() {
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations('pending'),
  ])
  const all = scopeNodes(session, await syncAndListNodes())
  const pending = all.filter((n) => n.status === 'pending')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('description', { count: pending.length })}
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>{t('alias')}</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>{t('tags')}</TableHead>
              <TableHead>{t('createdAt')}</TableHead>
              <TableHead className="text-right">{t('approval')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              pending.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="text-muted-foreground">
                    {n.id}
                  </TableCell>
                  <TableCell className="font-medium">{n.givenName}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {n.ipAddresses.join(' / ')}
                  </TableCell>
                  <TableCell className="text-xs">
                    {n.tags.join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtTime(n.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <PendingRowActions id={n.id} name={n.givenName} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
