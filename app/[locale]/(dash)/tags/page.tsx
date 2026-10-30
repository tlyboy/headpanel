import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/lib/auth'
import { approvedTag } from '@/lib/default-zone'
import { listNodes } from '@/lib/headscale'
import { declaredTags, loadBaseline, ruleKey } from '@/lib/policy'
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
import { DeleteRule, DeleteTag, MutualToggle, RuleForm, TagForm } from './forms'

export const dynamic = 'force-dynamic'

// Policy entries look like "tag:x:*" or "192.168.1.0/24:*"; show the tag name, or the subnet with the node that routes it
function Endpoints({ items, routers }: { items: string[]; routers: Map<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((raw) => {
        const x = raw.replace(/:\*$/, '')
        const via = routers.get(x)
        return (
          <Badge key={raw} variant="outline" className={x.startsWith('tag:') ? '' : 'font-mono'}>
            {tagLabel(x)}
            {via && <span className="ml-1 font-sans text-muted-foreground">({via})</span>}
          </Badge>
        )
      })}
    </div>
  )
}

function ruleText(items: string[]): string {
  return items.map((x) => tagLabel(x.replace(/:\*$/, ''))).join(', ')
}

export default async function TagsPage() {
  const [, t] = await Promise.all([requireSession(), getTranslations('tags')])
  const baseline = loadBaseline()
  const tags = declaredTags(baseline)
  const acls = baseline.acls ?? []
  const defaultRule = acls.find((a) => a.action === 'accept')
  const isSelf = (r: (typeof acls)[number]) =>
    r.src.length === 1 && r.dst.length === 1 && r.dst[0] === `${r.src[0]}:*`
  const selfKey = new Map(acls.filter(isSelf).map((r) => [r.src[0], ruleKey(r)]))
  // A tag can also be mutual through a wider rule (tag:ttxs in the default rule); that one isn't toggled here
  const mutual = (tag: string) =>
    acls.some((r) => r.src.includes(tag) && r.dst.includes(`${tag}:*`))
  const crossRules = acls.filter((r) => r !== defaultRule && !isSelf(r))
  const nodes = await listNodes()
  const routers = new Map<string, string>()
  for (const n of nodes) {
    for (const route of n.subnetRoutes ?? []) routers.set(route, n.givenName)
  }
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
                  <TableHead>{t('mutual')}</TableHead>
                  <TableHead>{t('devices')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => {
                  const m = members(tag)
                  return (
                    <TableRow key={tag}>
                      <TableCell className="text-sm font-medium">
                        {tagLabel(tag)}
                        {tag === approvedTag() && (
                          <Badge variant="secondary" className="ml-2">
                            {t('default')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <MutualToggle
                          tag={tag}
                          checked={mutual(tag)}
                          selfKey={selfKey.get(tag)}
                          disabled={mutual(tag) && !selfKey.has(tag)}
                        />
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
          <div className="flex flex-col divide-y rounded-md border">
            {crossRules.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">{t('noRules')}</p>
            )}
            {crossRules.map((rule) => (
              <div key={ruleKey(rule)} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Endpoints items={rule.src} routers={routers} />
                <span className="shrink-0 text-muted-foreground">{t('canReach')}</span>
                <Endpoints items={rule.dst} routers={routers} />
                <div className="ml-auto">
                  <DeleteRule
                    ruleKey={ruleKey(rule)}
                    summary={`${ruleText(rule.src)} → ${ruleText(rule.dst)}`}
                  />
                </div>
              </div>
            ))}
            {defaultRule && (
              <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
                <Endpoints items={defaultRule.src} routers={routers} />
                <span className="shrink-0">{t('canReach')}</span>
                <Endpoints items={defaultRule.dst} routers={routers} />
                <Badge variant="secondary" className="ml-auto shrink-0">
                  {t('defaultRule')}
                </Badge>
              </div>
            )}
          </div>
          <RuleForm tags={tags} />
        </CardContent>
      </Card>
    </div>
  )
}
