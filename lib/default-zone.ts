import 'server-only'

import { cache } from 'react'
import { listUsers, type HsUser } from '@/lib/headscale'

const DEFAULT_HS_USER = 'admin'
const DEFAULT_APPROVED_TAG = 'tag:approved'

// 默认区 = 不属于任何组的那部分 tailnet。组是可选的隔离单元，没有组时节点仍要
// 能审批、key 仍要能发，而这两件事各需要一个确定的值：
//  - headscale 建 preauthkey 必须带 user，组外的 key 挂在这个 user 名下
//  - 审批节点要打一个放行 tag，组外的节点打这个 tag
// 两者的 owner 关系由 policy 基线声明（见 lib/policy.ts），面板只负责引用。
export class DefaultZoneError extends Error {
  constructor(readonly userName: string) {
    super(
      `Default headscale user "${userName}" does not exist; set HEADPANEL_DEFAULT_HS_USER to an existing user`,
    )
    this.name = 'DefaultZoneError'
  }
}

export function defaultHsUserName(): string {
  return process.env.HEADPANEL_DEFAULT_HS_USER?.trim() || DEFAULT_HS_USER
}

export function approvedTag(): string {
  return process.env.HEADPANEL_APPROVED_TAG?.trim() || DEFAULT_APPROVED_TAG
}

// 按名字查出默认 user 拿它的 id（createPreAuthKey 要的是 id，不是 name）。
// 按请求缓存，一次请求里多处用到不会重复打 headscale。
export const resolveDefaultHsUser = cache(
  async function resolveDefaultHsUser(): Promise<HsUser> {
    const name = defaultHsUserName()
    const user = (await listUsers()).find((u) => u.name === name)
    if (!user) throw new DefaultZoneError(name)
    return user
  },
)
