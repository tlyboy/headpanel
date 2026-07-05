import 'server-only'

import { db } from '@/lib/db'
import { groups } from '@/lib/db/schema'
import { setPolicy } from '@/lib/headscale'

// 由 groups 表生成 headscale v2 policy：
//  - 每组一个 ok_tag，owner 为该组 headscale user name（必须带 @）
//  - 每组一条 accept 规则：同 ok_tag 互通；跨组无规则 → deny → 互不可见
//  - 未打 ok_tag 的节点（待审批）不在任何规则里 → 对谁都不可见
export function buildPolicy(
  rows: { hsUserName: string; okTag: string }[],
): string {
  const tagOwners: Record<string, string[]> = {}
  const acls: { action: 'accept'; src: string[]; dst: string[] }[] = []
  for (const g of rows) {
    tagOwners[g.okTag] = [`${g.hsUserName}@`]
    acls.push({ action: 'accept', src: [g.okTag], dst: [`${g.okTag}:*`] })
  }
  return JSON.stringify({ tagOwners, acls }, null, 2)
}

// 全量重算并下发。groups 为空时拒绝下发（空 policy = deny-all 会误断现网，坑 12）。
export async function rebuildPolicy(): Promise<void> {
  const rows = db.select().from(groups).all()
  if (rows.length === 0) {
    throw new Error('rebuildPolicy: refusing to apply an empty policy because no groups exist')
  }
  await setPolicy(
    buildPolicy(rows.map((g) => ({ hsUserName: g.hsUserName, okTag: g.okTag }))),
  )
}
