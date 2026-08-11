import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { syncAndListNodes } from '@/lib/nodes-sync'
import { requireSession } from '@/lib/auth'
import { scopeNodes } from '@/lib/groups'
import { fmtTime, pickIpv4 } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ListFilters } from '@/components/list-filters'
import { ColumnFilter } from '@/components/column-filter'
import {
  columnCookieName,
  makeIsVisible,
  parseHidden,
  visibleCount,
  type ColumnDef,
} from '@/components/columns'
import { STICKY_ACTIONS_WIDE } from '@/lib/table'
import { PendingRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

const PAGE = 'pending'

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, t, sp, cookieStore] = await Promise.all([
    requireSession(),
    getTranslations('pending'),
    searchParams,
    cookies(),
  ])
  const one = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v)?.trim() || ''
  }
  const q = one('q').toLowerCase()

  const all = scopeNodes(session, await syncAndListNodes())
  const pending = all
    .filter((n) => n.status === 'pending')
    .filter((n) => {
      if (!q) return true
      return [n.givenName, ...n.ipAddresses, ...n.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })

  const columns: ColumnDef[] = [
    { key: 'id', label: 'ID' },
    { key: 'alias', label: t('alias') },
    { key: 'ip', label: 'IP' },
    { key: 'tags', label: t('tags') },
    { key: 'createdAt', label: t('createdAt') },
    { key: 'approval', label: t('approval'), locked: true },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        placeholder={t('searchPlaceholder')}
        columns={
          <ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {show('id') && <TableHead className="w-12">ID</TableHead>}
              {show('alias') && <TableHead>{t('alias')}</TableHead>}
              {show('ip') && <TableHead>IP</TableHead>}
              {show('tags') && <TableHead>{t('tags')}</TableHead>}
              {show('createdAt') && <TableHead>{t('createdAt')}</TableHead>}
              <TableHead
                className={STICKY_ACTIONS_WIDE}
                aria-label={t('approval')}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCount(columns, hidden)}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              pending.map((n) => (
                <TableRow key={n.id}>
                  {show('id') && (
                    <TableCell className="text-muted-foreground">
                      {n.id}
                    </TableCell>
                  )}
                  {show('alias') && (
                    <TableCell className="font-medium">{n.givenName}</TableCell>
                  )}
                  {show('ip') && (
                    <TableCell className="font-mono text-xs">
                      {pickIpv4(n.ipAddresses) ?? '—'}
                    </TableCell>
                  )}
                  {show('tags') && (
                    <TableCell className="text-xs">
                      {n.tags.join(', ') || '—'}
                    </TableCell>
                  )}
                  {show('createdAt') && (
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtTime(n.createdAt)}
                    </TableCell>
                  )}
                  <TableCell className={STICKY_ACTIONS_WIDE}>
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
