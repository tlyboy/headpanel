import 'server-only'

import { readFileSync } from 'node:fs'
import { HeadscaleError, setPolicy } from '@/lib/headscale'

const DEFAULT_BASELINE_PATH = '/etc/headpanel/policy-baseline.json'

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

// 基线不可用（读不出、解析不了、与组 tag 撞名）时一律整体失败。
// 绝不能降级成空基线继续下发：那正是「建组/删组把 tag:approved 和子网规则
// 冲掉、全网 ACL 归零」的成因。
export class PolicyBaselineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PolicyBaselineError'
  }
}

interface PolicyAcl {
  action: 'accept'
  src: string[]
  dst: string[]
}

type PolicyBaseline = Record<string, unknown> & {
  tagOwners?: Record<string, string[]>
  acls?: PolicyAcl[]
}

// 不归 groups 表管、但必须长期存在的那部分 policy：tag:approved 的 owner、
// 子网路由（如 192.168.120.0/24）的 dst 等。放文件而非硬编码，以后加子网
// 只改文件、不必改代码重新构建。文件不存在 = 无基线（兼容旧部署）；
// 存在但读不了/解析不了则抛错，宁可组操作失败也不下发丢了基线的 policy。
export function loadBaseline(): PolicyBaseline {
  const path = process.env.HEADPANEL_POLICY_BASELINE || DEFAULT_BASELINE_PATH
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new PolicyBaselineError(
      `Cannot read policy baseline ${path}: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new PolicyBaselineError(
      `Policy baseline ${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PolicyBaselineError(
      `Policy baseline ${path} must be a JSON object`,
    )
  }
  return parsed as PolicyBaseline
}

// 由基线 + groups 表生成 headscale v2 policy：
//  - 基线原样保留（含 hosts / autoApprovers 等本函数不认识的顶层字段）
//  - 每组一个 ok_tag，owner 为该组 headscale user name（必须带 @）
//  - 每组一条 accept 规则：同 ok_tag 互通；跨组无规则 → deny → 互不可见
//  - 未打 ok_tag 的节点（待审批）不在任何规则里 → 对谁都不可见
export function buildPolicy(
  rows: { hsUserName: string; okTag: string }[],
): string {
  const baseline = loadBaseline()
  const tagOwners: Record<string, string[]> = { ...(baseline.tagOwners ?? {}) }
  const acls: PolicyAcl[] = [...(baseline.acls ?? [])]
  for (const g of rows) {
    // 撞名就报错而不是覆盖：基线里的 tag 由人工维护，面板无权顶掉
    if (g.okTag in tagOwners) {
      throw new PolicyBaselineError(
        `Group tag ${g.okTag} collides with a tag already defined in the policy baseline`,
      )
    }
    tagOwners[g.okTag] = [`${g.hsUserName}@`]
    acls.push({ action: 'accept', src: [g.okTag], dst: [`${g.okTag}:*`] })
  }
  return JSON.stringify({ ...baseline, tagOwners, acls }, null, 2)
}

// 下发【操作完成后应有的】组集合对应的 policy。调用方要在改动任何数据之前调它：
// 推不上去就整体失败，不会留下「headscale 已改、面板报错」的半成品。
// rows 为空时只剩基线（组规则全部消失），此时 deleteGroup 已保证组内无节点。
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
