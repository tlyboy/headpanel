'use client'

import { useTranslations } from 'next-intl'
import { CmdBlock } from '@/components/cmd-block'
import { psDownloadAndRun } from '@/lib/ps-command'
import { useCurrentOrigin } from '@/lib/use-current-origin'

type CommandLabelKey =
  | 'linuxUninstallTailscaleCommand'
  | 'linuxUninstallZerotierCommand'
  | 'windowsUninstallTailscaleCommand'
  | 'windowsUninstallZerotierCommand'

export function UninstallCommands({ basePath }: { basePath: string }) {
  const t = useTranslations('scripts')
  const panel = `${useCurrentOrigin()}${basePath}`

  const cmds: { labelKey: CommandLabelKey; cmd: string }[] = [
    {
      labelKey: 'linuxUninstallTailscaleCommand',
      cmd: `curl -fsSL ${panel}/api/scripts/uninstall-tailscale.sh -o /tmp/uninstall-tailscale.sh && sudo bash /tmp/uninstall-tailscale.sh`,
    },
    {
      labelKey: 'linuxUninstallZerotierCommand',
      cmd: `curl -fsSL ${panel}/api/scripts/uninstall-zerotier.sh -o /tmp/uninstall-zerotier.sh && sudo bash /tmp/uninstall-zerotier.sh`,
    },
    {
      labelKey: 'windowsUninstallTailscaleCommand',
      cmd: psDownloadAndRun(`${panel}/api/scripts/uninstall-tailscale.ps1`, 'u.ps1'),
    },
    {
      labelKey: 'windowsUninstallZerotierCommand',
      cmd: psDownloadAndRun(`${panel}/api/scripts/uninstall-zerotier.ps1`, 'u.ps1'),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t('remoteUninstall')}</h3>
        <p className="text-sm text-muted-foreground">{t('remoteUninstallDescription')}</p>
      </div>
      {cmds.map((c) => (
        <CmdBlock key={c.labelKey} label={t(c.labelKey)} cmd={c.cmd} />
      ))}
    </div>
  )
}
