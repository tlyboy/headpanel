import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { ArrowRight } from 'lucide-react'
import { requireSuper } from '@/lib/auth'
import { listGrants, type Endpoint } from '@/lib/grants'
import { groupOfNode, listGroups } from '@/lib/groups'
import { listNodes } from '@/lib/headscale'
import { fmtTime, pickIpv4 } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
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
import { STICKY_ACTIONS } from '@/lib/table'
import { CreateGrant } from './grant-form'
import { GrantRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

const PAGE = 'access'

interface EndpointView {
  label: string
  ip?: string
  gone: boolean
}

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [, t, sp, cookieStore] = await Promise.all([
    requireSuper(),
    getTranslations('access'),
    searchParams,
    cookies(),
  ])
  const rawQ = sp.q
  const q = ((Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? '').trim().toLowerCase()
  const nodesPromise = listNodes()
  const groups = listGroups()
  const grants = listGrants()
  const nodes = await nodesPromise

  const groupById = new Map(groups.map((g) => [g.id, g]))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  function view(e: Endpoint): EndpointView {
    if (e.kind === 'zone') return { label: t('defaultZone'), gone: false }
    if (e.kind === 'group') {
      const g = groupById.get(e.groupId)
      return g ? { label: g.name, gone: false } : { label: `#${e.groupId}`, gone: true }
    }
    const n = nodeById.get(e.nodeId)
    return n
      ? { label: n.givenName, ip: pickIpv4(n.ipAddresses), gone: false }
      : { label: `#${e.nodeId}`, gone: true }
  }

  const rows = grants.map((g) => ({ grant: g, src: view(g.src), dst: view(g.dst) }))
  const shown = q
    ? rows.filter((r) =>
        [r.src.label, r.src.ip, r.dst.label, r.dst.ip, r.grant.ports, r.grant.note]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    : rows

  const groupOptions = groups.map((g) => ({ value: String(g.id), label: g.name }))
  const nodeOptions = nodes
    .map((n) => ({
      value: n.id,
      label: `${n.givenName} (${groupOfNode(n, groups)?.name ?? t('defaultZone')})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const columns: ColumnDef[] = [
    { key: 'source', label: t('source') },
    { key: 'destination', label: t('destination') },
    { key: 'ports', label: t('ports') },
    { key: 'note', label: t('note') },
    { key: 'createdAt', label: t('createdAt') },
    { key: 'actions', label: t('actions'), locked: true },
  ]
  const hidden = parseHidden(cookieStore.get(columnCookieName(PAGE))?.value)
  const show = makeIsVisible(columns, hidden)

  const cell = (v: EndpointView) => (
    <span className="inline-flex items-center gap-2">
      <span className={v.gone ? 'text-muted-foreground line-through' : undefined}>{v.label}</span>
      {v.ip && <span className="font-mono text-xs text-muted-foreground">{v.ip}</span>}
      {v.gone && <Badge variant="destructive">{t('gone')}</Badge>}
    </span>
  )

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        placeholder={t('searchPlaceholder')}
        actions={<CreateGrant groups={groupOptions} nodes={nodeOptions} />}
        columns={<ColumnFilter page={PAGE} columns={columns} hidden={[...hidden]} />}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {show('source') && <TableHead>{t('source')}</TableHead>}
              {show('destination') && <TableHead>{t('destination')}</TableHead>}
              {show('ports') && <TableHead>{t('ports')}</TableHead>}
              {show('note') && <TableHead>{t('note')}</TableHead>}
              {show('createdAt') && <TableHead>{t('createdAt')}</TableHead>}
              <TableHead className={STICKY_ACTIONS} aria-label={t('actions')} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCount(columns, hidden)}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              shown.map(({ grant, src, dst }) => (
                <TableRow key={grant.id}>
                  {show('source') && <TableCell className="text-sm">{cell(src)}</TableCell>}
                  {show('destination') && (
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center gap-2">
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                        {cell(dst)}
                      </span>
                    </TableCell>
                  )}
                  {show('ports') && (
                    <TableCell className="font-mono text-xs">{grant.ports}</TableCell>
                  )}
                  {show('note') && (
                    <TableCell className="text-xs text-muted-foreground">
                      {grant.note ?? '—'}
                    </TableCell>
                  )}
                  {show('createdAt') && (
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtTime(grant.createdAt.replace(' ', 'T') + 'Z')}
                    </TableCell>
                  )}
                  <TableCell className={STICKY_ACTIONS}>
                    <GrantRowActions id={grant.id} src={src.label} dst={dst.label} />
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
