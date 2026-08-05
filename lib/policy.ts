import 'server-only'

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
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
export function baselinePath(): string {
  return process.env.HEADPANEL_POLICY_BASELINE || DEFAULT_BASELINE_PATH
}

export function loadBaseline(): PolicyBaseline {
  const path = baselinePath()
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

// 批准一条子网路由并不足以让它通：ACL 的 dst 必须显式含该网段，否则包在
// tailscale 数据面就被丢了（今天 192.168.120.0/24 不通就是卡在这一步）。
// 基线是人工维护的文件，所以这里只做最小改动——往既有的 accept 规则里加/减
// 一个 "<cidr>:*"，不新建规则、不碰其它字段。
export class BaselineNotWritableError extends Error {
  constructor(reason: string) {
    super(`Cannot update the policy baseline: ${reason}`)
    this.name = 'BaselineNotWritableError'
  }
}

type Mutator = (b: PolicyBaseline) => boolean

// 找第一条 accept 规则来挂载子网 dst。基线里一条都没有时不擅自新建：
// src 该写什么只有人知道，猜错等于给全网开一条规则。
function firstAcceptRule(b: PolicyBaseline): PolicyAcl {
  const rule = (b.acls ?? []).find((a) => a.action === 'accept')
  if (!rule) {
    throw new BaselineNotWritableError(
      'the baseline has no accept rule to attach the subnet to',
    )
  }
  return rule
}

export function addSubnetDst(cidr: string): Mutator {
  return (b) => {
    const want = `${cidr}:*`
    const rule = firstAcceptRule(b)
    if (rule.dst.includes(want)) return false
    rule.dst.push(want)
    return true
  }
}

export function removeSubnetDst(cidr: string): Mutator {
  return (b) => {
    const want = `${cidr}:*`
    const rule = firstAcceptRule(b)
    const next = rule.dst.filter((d) => d !== want)
    if (next.length === rule.dst.length) return false
    rule.dst = next
    return true
  }
}

// 改基线 → 下发 → 失败则把文件回滚。基线写成功但 headscale 拒绝新 policy 时，
// 留着改过的文件会让后续每次组操作都带着这条坏规则重下，所以必须还原。
export async function updateBaselineAndApply(
  mutate: Mutator,
  rows: { hsUserName: string; okTag: string }[],
): Promise<boolean> {
  const path = baselinePath()
  const original = existsSync(/* turbopackIgnore: true */ path)
    ? readFileSync(/* turbopackIgnore: true */ path, 'utf8')
    : null
  const baseline = loadBaseline()
  if (!mutate(baseline)) return false

  writeFileSync(
    /* turbopackIgnore: true */ path,
    `${JSON.stringify(baseline, null, 2)}\n`,
    { mode: 0o600 },
  )
  try {
    await applyPolicy(rows)
    return true
  } catch (e) {
    if (original == null) {
      unlinkSync(/* turbopackIgnore: true */ path)
    } else {
      writeFileSync(/* turbopackIgnore: true */ path, original, { mode: 0o600 })
    }
    throw e
  }
}
