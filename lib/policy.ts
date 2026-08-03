import 'server-only'

import { HeadscaleError, setPolicy } from '@/lib/headscale'

// headscale 只在 policy.mode=database 时接受 PUT /policy，file 模式恒 500。
// 面板的组隔离完全依赖下发 ACL，模式不对时组操作必须整体放弃而不是带病继续。
export class PolicyReadOnlyError extends Error {
  constructor() {
    super(
      "headscale rejects policy updates because policy.mode is not 'database'",
    )
    this.name = 'PolicyReadOnlyError'
  }
}

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

// 下发【操作完成后应有的】组集合对应的 policy。调用方要在改动任何数据之前调它：
// 推不上去就整体失败，不会留下「headscale 已改、面板报错」的半成品。
// rows 为空时下发空 policy（= deny-all），此时 deleteGroup 已保证组内无节点。
export async function applyPolicy(
  rows: { hsUserName: string; okTag: string }[],
): Promise<void> {
  try {
    await setPolicy(buildPolicy(rows))
  } catch (e) {
    if (
      e instanceof HeadscaleError &&
      /modes other than|policy\.mode/i.test(e.message)
    ) {
      throw new PolicyReadOnlyError()
    }
    throw e
  }
}
