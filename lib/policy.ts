import 'server-only'

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { HeadscaleError, setPolicy } from '@/lib/headscale'

const DEFAULT_BASELINE_PATH = '/etc/headpanel/policy-baseline.json'

// headscale only accepts PUT /policy when policy.mode=database; file mode always returns 500.
// The panel's group isolation relies entirely on the deployed ACL. If the mode is wrong, group operations must abort completely rather than continue in a broken state.
export class PolicyReadOnlyError extends Error {
  constructor() {
    super(
      "headscale rejects policy updates because policy.mode is not 'database'",
    )
    this.name = 'PolicyReadOnlyError'
  }
}

// If the baseline is unavailable (unreadable, unparsable, or colliding with a group tag), fail completely.
// Never fall back to an empty baseline and continue deploying: that is exactly what causes "creating/deleting a group overwrites tag:approved and subnet rules,
// zeroing out the ACL for the entire network."
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

// The part of the policy not managed by the groups table, but that must persist: the owner of tag:approved,
// subnet routes (e.g. 192.168.120.0/24) in dst, etc. Keep it in a file rather than hard-coding it, so adding a subnet later
// only requires changing the file, not changing the code and rebuilding. A missing file means no baseline (for compatibility with older deployments);
// if the file exists but cannot be read or parsed, throw an error. Better to fail the group operation than apply a policy that has lost the baseline.
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

// Generate the headscale v2 policy from the baseline and groups table:
//  - Preserve the baseline as-is (including top-level fields this function doesn't recognize, such as hosts / autoApprovers)
//  - One ok_tag per group, owned by that group's headscale user name (must include @)
//  - One accept rule per group: members with the same ok_tag can communicate; no cross-group rules → deny → groups cannot see each other
//  - Nodes without an ok_tag (pending approval) are in no rules → invisible to everyone
export function buildPolicy(
  rows: { hsUserName: string; okTag: string }[],
): string {
  const baseline = loadBaseline()
  const tagOwners: Record<string, string[]> = { ...(baseline.tagOwners ?? {}) }
  const acls: PolicyAcl[] = [...(baseline.acls ?? [])]
  for (const g of rows) {
    // On a name collision, report an error instead of overwriting: baseline tags are maintained manually, and the panel has no right to replace them
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

// Deploy the policy corresponding to the group set that should exist after the operation. The caller must invoke this before changing any data:
// if deployment fails, the whole operation fails, avoiding a partial state where "headscale has changed but the panel reports an error."
// When rows is empty, only the baseline remains (all group rules disappear); deleteGroup has already ensured there are no nodes in the group.
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

// Approving a subnet route alone is not enough to make it work: dst in the ACL must explicitly include that subnet, or packets get
// dropped in the Tailscale data plane (the reason 192.168.120.0/24 is unreachable today).
// Since the baseline is a manually maintained file, make the smallest possible change here—add or remove
// one "<cidr>:*" in an existing accept rule, without creating rules or touching other fields.
export class BaselineNotWritableError extends Error {
  constructor(reason: string) {
    super(`Cannot update the policy baseline: ${reason}`)
    this.name = 'BaselineNotWritableError'
  }
}

type Mutator = (b: PolicyBaseline) => boolean

// Find the first accept rule to attach the subnet dst to. If the baseline has none, don't create one on your own:
// only a person knows what src should be; guessing wrong is equivalent to opening a rule to the entire network.
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

// Update the baseline → deploy → roll back the file on failure. If writing the baseline succeeds but headscale rejects the new policy,
// keeping the modified file would cause every subsequent group operation to redeploy this bad rule, so it must be restored.
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
