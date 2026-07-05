'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSuper } from '@/lib/auth'
import { audit } from '@/lib/db'
import { updateHeadscaleIpv4Prefix } from '@/lib/headscale-config'
import { listNodes } from '@/lib/headscale'

export interface ActionResult {
  ok: boolean
  error?: string
  backupPath?: string
}

function fail(e: unknown, unknownMessage: string): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : unknownMessage }
}

export async function updateIpv4PrefixAction(
  ipv4Prefix: string,
): Promise<ActionResult> {
  const session = await requireSuper()
  const t = await getTranslations('actionErrors')
  try {
    const nodes = await listNodes()
    const used = new Set(
      nodes.flatMap((n) => n.ipAddresses.filter((ip) => ip.includes('.'))),
    )
    const result = await updateHeadscaleIpv4Prefix(ipv4Prefix)
    await audit(
      'network.prefix.v4.update',
      ipv4Prefix.trim(),
      `backup=${result.backupPath}; used_ipv4=${[...used].join(',') || 'none'}`,
      { groupId: null, actor: session.sub },
    )
    revalidatePath('/network')
    revalidatePath('/nodes')
    return { ok: true, backupPath: result.backupPath }
  } catch (e) {
    return fail(e, t('unknown'))
  }
}
