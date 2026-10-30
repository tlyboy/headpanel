import { Download } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getPanelBasePath } from '@/lib/panel-base-path'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/fold'
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

// Downloads and uninstall commands are rarely needed (each key already carries its install command), so they stay folded
export async function Scripts() {
  const basePath = getPanelBasePath()
  const [t, common] = await Promise.all([getTranslations('scripts'), getTranslations('common')])

  return (
    <Fold title={t('title')} summary={t('summary')}>
      {GROUPS.map((g) => (
        <div key={g.titleKey} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t(g.titleKey)}</h3>
          {g.items.map((it) => (
            <div
              key={it.file}
              className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-mono text-sm">{it.file}</div>
                <div className="text-xs text-muted-foreground">{t(it.descKey)}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<a href={`${basePath}/api/scripts/${it.file}`} download />}
              >
                <Download className="size-4" />
                {common('download')}
              </Button>
            </div>
          ))}
        </div>
      ))}

      <UninstallCommands basePath={basePath} />
    </Fold>
  )
}
