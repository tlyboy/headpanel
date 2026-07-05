import { Download } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UninstallCommands } from './uninstall-commands'

type ScriptDescKey =
  | 'linuxInstall'
  | 'windowsInstall'
  | 'remoteDeploy'
  | 'linuxUninstallTailscale'
  | 'windowsUninstallTailscale'
  | 'linuxUninstallZerotier'
  | 'windowsUninstallZerotier'

const GROUPS: {
  titleKey: 'onboarding' | 'uninstall'
  items: { file: string; descKey: ScriptDescKey }[]
}[] = [
  {
    titleKey: 'onboarding',
    items: [
      { file: 'install-tailscale.sh', descKey: 'linuxInstall' },
      { file: 'install-tailscale.ps1', descKey: 'windowsInstall' },
      {
        file: 'deploy-tailscale-linux.sh',
        descKey: 'remoteDeploy',
      },
    ],
  },
  {
    titleKey: 'uninstall',
    items: [
      { file: 'uninstall-tailscale.sh', descKey: 'linuxUninstallTailscale' },
      { file: 'uninstall-tailscale.ps1', descKey: 'windowsUninstallTailscale' },
      { file: 'uninstall-zerotier.sh', descKey: 'linuxUninstallZerotier' },
      { file: 'uninstall-zerotier.ps1', descKey: 'windowsUninstallZerotier' },
    ],
  },
]

export default async function ScriptsPage() {
  const [t, common] = await Promise.all([
    getTranslations('scripts'),
    getTranslations('common'),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('description')}
        </p>
      </div>

      {GROUPS.map((g) => (
        <Card key={g.titleKey}>
          <CardHeader>
            <CardTitle>{t(g.titleKey)}</CardTitle>
            <CardDescription>{t('scriptCount', { count: g.items.length })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {g.items.map((it) => (
              <div
                key={it.file}
                className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm">{it.file}</div>
                  <div className="text-muted-foreground text-xs">
                    {t(it.descKey)}
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/scripts/${it.file}`} download>
                    <Download className="size-4" />
                    {common('download')}
                  </a>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <UninstallCommands />
    </div>
  )
}
