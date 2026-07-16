'use client'

import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CmdBlock } from '@/components/cmd-block'
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
      cmd: `iwr ${panel}/api/scripts/uninstall-tailscale.ps1 -OutFile $env:TEMP\\u.ps1; & $env:TEMP\\u.ps1`,
    },
    {
      labelKey: 'windowsUninstallZerotierCommand',
      cmd: `iwr ${panel}/api/scripts/uninstall-zerotier.ps1 -OutFile $env:TEMP\\u.ps1; & $env:TEMP\\u.ps1`,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('remoteUninstall')}</CardTitle>
        <CardDescription>{t('remoteUninstallDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {cmds.map((c) => (
          <CmdBlock key={c.labelKey} label={t(c.labelKey)} cmd={c.cmd} />
        ))}
      </CardContent>
    </Card>
  )
}
