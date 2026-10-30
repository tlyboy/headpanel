import { getTranslations } from 'next-intl/server'
import { Tag } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { approvedTag } from '@/lib/default-zone'
import { listNodes } from '@/lib/headscale'
import { declaredTags, loadBaseline } from '@/lib/policy'
import { Badge } from '@/components/ui/badge'
import { tagLabel } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DeleteTag, TagForm } from './forms'

export const dynamic = 'force-dynamic'

export default async function TagsPage() {
  const [, t] = await Promise.all([requireSession(), getTranslations('tags')])
  const baseline = loadBaseline()
  const nodes = (await listNodes()).toSorted((a, b) => a.givenName.localeCompare(b.givenName))
  // Default tag first, the rest alphabetical
  const tags = declaredTags(baseline).toSorted(
    (a, b) => Number(b === approvedTag()) - Number(a === approvedTag()),
  )
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">{t('tagsTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('tagsDescription')}</p>
        </div>
        <TagForm />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {tags.map((tag) => {
          const members = nodes.filter((n) => n.tags.includes(tag))
          const online = members.filter((n) => n.online).length
          const isDefault = tag === approvedTag()
          return (
            <Card key={tag} className={isDefault ? 'lg:col-span-2' : undefined}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="size-4 text-muted-foreground" aria-hidden />
                    {tagLabel(tag)}
                    {isDefault && <Badge variant="secondary">{t('default')}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {t('memberCount', { count: members.length, online })}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={{ pathname: '/nodes', query: { tag } }} />}
                  >
                    {t('editMembers')}
                  </Button>
                  {!isDefault && <DeleteTag tag={tag} disabled={members.length > 0} />}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {members.length === 0 ? (
                  <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('noMembers')}
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {members.map((n) => (
                      <li
                        key={n.id}
                        className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-sm"
                      >
                        <span
                          className={`size-2 rounded-full ${n.online ? 'bg-success' : 'bg-muted-foreground/40'}`}
                          aria-label={n.online ? t('online') : t('offline')}
                        />
                        {n.givenName}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
