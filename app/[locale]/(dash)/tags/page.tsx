import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { approvedTag } from '@/lib/default-zone'
import { listNodes } from '@/lib/headscale'
import { declaredTags, loadBaseline, ruleKey } from '@/lib/policy'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DeleteRule, DeleteTag, RuleForm, TagForm } from './forms'

export const dynamic = 'force-dynamic'

function Endpoints({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x) => (
        <Badge key={x} variant="outline" className="font-mono">
          {x.replace(/:\*$/, '')}
        </Badge>
      ))}
    </div>
  )
}

export default async function TagsPage() {
  const [, t] = await Promise.all([requireSuper(), getTranslations('tags')])
  const baseline = loadBaseline()
  const tags = declaredTags(baseline)
  const acls = baseline.acls ?? []
  const subnetRule = acls.find((a) => a.action === 'accept')
  const nodes = await listNodes()
  const members = (tag: string) => nodes.filter((n) => n.tags.includes(tag))

  return (
    <div className="flex flex-col gap-6">
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
                  <TableHead>{t('tag')}</TableHead>
                  <TableHead>{t('devices')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => {
                  const m = members(tag)
                  return (
                    <TableRow key={tag}>
                      <TableCell className="font-mono text-sm">
                        {tag}
                        {tag === approvedTag() && (
                          <Badge variant="secondary" className="ml-2">
                            {t('default')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xl truncate text-sm text-muted-foreground">
                        {m.length} · {m.map((n) => n.givenName).join(', ')}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteTag tag={tag} disabled={tag === approvedTag() || m.length > 0} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('rulesTitle')}</CardTitle>
          <CardDescription>{t('rulesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('from')}</TableHead>
                  <TableHead>{t('to')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {acls.map((rule) => (
                  <TableRow key={ruleKey(rule)}>
                    <TableCell>
                      <Endpoints items={rule.src} />
                    </TableCell>
                    <TableCell>
                      <Endpoints items={rule.dst} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteRule ruleKey={ruleKey(rule)} disabled={rule === subnetRule} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <RuleForm tags={tags} />
        </CardContent>
      </Card>
    </div>
  )
}
