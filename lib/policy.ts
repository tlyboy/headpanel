import 'server-only'

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { HeadscaleError, setPolicy } from '@/lib/headscale'

const DEFAULT_BASELINE_PATH = '/etc/headpanel/policy-baseline.json'

// headscale only accepts PUT /policy when policy.mode=database; file mode always returns 500.
// Tag isolation relies entirely on the deployed ACL. If the mode is wrong, tag operations must abort completely rather than continue in a broken state.
export class PolicyReadOnlyError extends Error {
  constructor() {
    super("headscale rejects policy updates because policy.mode is not 'database'")
    this.name = 'PolicyReadOnlyError'
  }
}

// If the baseline is unavailable (unreadable or unparsable), fail completely.
// Never fall back to an empty baseline and continue deploying: that would zero out the ACL for the entire network.
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

// The baseline file is the whole policy: tag owners, tag rules and subnet routes (such as 192.168.1.0/24) in dst.
// Keeping it in a file means it can also be edited by hand, with no code changes or rebuild. A missing file means an empty policy;
// if the file exists but cannot be read or parsed, throw an error. Better for a policy change to fail than to deploy a broken policy.
export function baselinePath(): string {
  return process.env.HEADPANEL_POLICY_BASELINE || DEFAULT_BASELINE_PATH
}

export function loadBaseline(): PolicyBaseline {
  const path = baselinePath()
  let raw: string
  try {
    raw = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
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
    throw new PolicyBaselineError(`Policy baseline ${path} must be a JSON object`)
  }
  return parsed as PolicyBaseline
}

// Deploy the baseline. Callers deploy before changing any panel data: if deployment fails, the whole operation fails,
// avoiding a partial state where "headscale has changed but the panel reports an error."
export async function applyPolicy(): Promise<void> {
  try {
    await setPolicy(JSON.stringify(loadBaseline(), null, 2))
  } catch (e) {
    if (e instanceof HeadscaleError && /modes other than|policy\.mode/i.test(e.message)) {
      throw new PolicyReadOnlyError()
    }
    throw e
  }
}

// Approving a subnet route alone is not enough to make it reachable: the ACL's dst must explicitly include that subnet, or packets are
// dropped in the tailscale data plane — the route appears approved, but nothing in the subnet can connect.
// The baseline is a manually maintained file, so make only the smallest change here — add/remove
// one "<cidr>:*" to an existing accept rule, without creating rules or touching other fields.
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
    throw new BaselineNotWritableError('the baseline has no accept rule to attach the subnet to')
  }
  return rule
}

// A LAN behind a subnet router belongs to the router's groups: whoever can reach the router can reach the LAN.
// The subnet goes into the rule of each tag the router carries; an untagged router falls back to the default rule.
export function addSubnetDst(cidr: string, routerTags: string[]): Mutator {
  return (b) => {
    const want = `${cidr}:*`
    const acls = b.acls ?? []
    const owned = acls.filter(
      (a) => a.action === 'accept' && a.src.length === 1 && routerTags.includes(a.src[0]),
    )
    const rules = owned.length ? owned : [firstAcceptRule(b)]
    let changed = false
    for (const rule of rules) {
      if (rule.dst.includes(want)) continue
      rule.dst.push(want)
      changed = true
    }
    return changed
  }
}

export function removeSubnetDst(cidr: string): Mutator {
  return (b) => {
    const want = `${cidr}:*`
    let changed = false
    for (const rule of b.acls ?? []) {
      const next = rule.dst.filter((d) => d !== want)
      if (next.length === rule.dst.length) continue
      rule.dst = next
      changed = true
    }
    return changed
  }
}

// A tag is a group: tagOwners declares it, and its own rule "tag → tag:*" lets its members reach each other.
// Every tag is owned by the default user, so only the panel (never a client's own auth key) can put one on a node.
export const TAG_RE = /^tag:[a-z0-9][a-z0-9-]{0,62}$/

export function declaredTags(b: PolicyBaseline = loadBaseline()): string[] {
  return Object.keys(b.tagOwners ?? {}).sort()
}

function isSelfRule(rule: PolicyAcl, tag: string): boolean {
  return (
    rule.src.length === 1 &&
    rule.src[0] === tag &&
    rule.dst.length === 1 &&
    rule.dst[0] === `${tag}:*`
  )
}

export function addTag(tag: string, owner: string): Mutator {
  return (b) => {
    if (!TAG_RE.test(tag)) throw new BaselineNotWritableError(`invalid tag name ${tag}`)
    if (b.tagOwners?.[tag]) return false
    b.tagOwners = { ...b.tagOwners, [tag]: [owner] }
    b.acls = [...(b.acls ?? []), { action: 'accept', src: [tag], dst: [`${tag}:*`] }]
    return true
  }
}

// Only the tag's own rule goes with it; a hand-written rule naming it must be removed first,
// or deleting the tag would silently change someone else's access.
export function removeTag(tag: string): Mutator {
  return (b) => {
    if (!b.tagOwners?.[tag]) return false
    const acls = (b.acls ?? []).filter((r) => !isSelfRule(r, tag))
    if (acls.some((r) => r.src.includes(tag) || r.dst.includes(`${tag}:*`))) {
      throw new BaselineNotWritableError(`${tag} is still used by an access rule`)
    }
    const { [tag]: _, ...rest } = b.tagOwners
    b.tagOwners = rest
    b.acls = acls
    return true
  }
}

// Update the baseline → deploy → roll back the file on failure. If writing the baseline succeeds but headscale rejects the new policy,
// keeping the modified file would cause every later policy change to redeploy this bad rule, so it must be restored.
export async function updateBaselineAndApply(mutate: Mutator): Promise<boolean> {
  const path = baselinePath()
  const original = existsSync(/* turbopackIgnore: true */ path)
    ? readFileSync(/* turbopackIgnore: true */ path, 'utf8')
    : null
  const baseline = loadBaseline()
  if (!mutate(baseline)) return false

  writeFileSync(/* turbopackIgnore: true */ path, `${JSON.stringify(baseline, null, 2)}\n`, {
    mode: 0o600,
  })
  try {
    await applyPolicy()
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
