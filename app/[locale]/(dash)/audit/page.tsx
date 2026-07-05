import { desc, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { fmtTime } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const session = await requireSession()
  const t = await getTranslations('audit')
  // 组管理员只看本组审计；super 看全部
  const base = db.select().from(auditLog).$dynamic()
  const rows = (
    session.role === 'super'
      ? base
      : base.where(eq(auditLog.groupId, session.gid as number))
  )
    .orderBy(desc(auditLog.id))
    .limit(200)
    .all()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('description')}
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">{t('time')}</TableHead>
              <TableHead>{t('actor')}</TableHead>
              <TableHead>{t('action')}</TableHead>
              <TableHead>{t('target')}</TableHead>
              <TableHead>{t('detail')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {fmtTime(r.ts.replace(' ', 'T') + 'Z')}
                  </TableCell>
                  <TableCell className="text-xs">{r.actor ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell className="text-xs">{r.target ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.detail ?? '—'}
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
