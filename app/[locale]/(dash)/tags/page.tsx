import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { approvedTag } from '@/lib/default-zone'
import { listNodes } from '@/lib/headscale'
import { declaredTags, loadBaseline } from '@/lib/policy'
import { Badge } from '@/components/ui/badge'
import { tagLabel } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DeleteTag, EditMembers, TagForm } from './forms'

export const dynamic = 'force-dynamic'

export default async function TagsPage() {
  const [, t] = await Promise.all([requireSession(), getTranslations('tags')])
  const baseline = loadBaseline()
  const tags = declaredTags(baseline)
  const nodes = (await listNodes()).toSorted((a, b) => a.givenName.localeCompare(b.givenName))
  const options = nodes.map((n) => ({
    id: n.id,
    name: n.givenName,
    ip: n.ipAddresses.find((ip) => ip.includes('.')) ?? '',
    tags: n.tags,
  }))

  // Approved subnets ride on the first accept rule; show them under the tags that rule starts from
  const routers = new Map<string, string>()
  for (const n of nodes) for (const r of n.subnetRoutes ?? []) routers.set(r, n.givenName)
  const subnetRule = (baseline.acls ?? []).find((a) => a.action === 'accept')
  const subnets = (subnetRule?.dst ?? [])
    .map((d) => d.replace(/:\*$/, ''))
    .filter((d) => !d.startsWith('tag:'))
  const reachesSubnets = (tag: string) => subnets.length > 0 && !!subnetRule?.src.includes(tag)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tagsTitle')}</CardTitle>
        <CardDescription>{t('tagsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TagForm />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t('tag')}</TableHead>
                <TableHead>{t('devices')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((tag) => {
                const members = nodes.filter((n) => n.tags.includes(tag))
                return (
                  <TableRow key={tag}>
                    <TableCell className="align-top text-sm font-medium">
                      {tagLabel(tag)}
                      {tag === approvedTag() && (
                        <Badge variant="secondary" className="ml-2">
                          {t('default')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {members.length === 0 && (
                          <span className="text-sm text-muted-foreground">{t('noMembers')}</span>
                        )}
                        {members.map((n) => (
                          <Badge key={n.id} variant="outline">
                            {n.givenName}
                          </Badge>
                        ))}
                      </div>
                      {reachesSubnets(tag) && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('alsoSubnets')}{' '}
                          {subnets
                            .map((s) => (routers.has(s) ? `${s} (${routers.get(s)})` : s))
                            .join(', ')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top whitespace-nowrap">
                      <EditMembers tag={tag} nodes={options} />
                      <DeleteTag tag={tag} disabled={tag === approvedTag() || members.length > 0} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
