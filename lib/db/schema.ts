import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// 组/租户。每组对应一个 headscale user（namespace）做归属边界，
// 一个 ok_tag（如 tag:ok-acme）做组内互通门票（ACL 据此放通同组节点）。
export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(), // panel group slug
  name: text('name').notNull(), // 显示名
  hsUserId: text('hs_user_id').notNull(), // headscale user id
  hsUserName: text('hs_user_name').notNull(), // headscale user name for policy owners
  okTag: text('ok_tag').notNull(), // 互通门票 tag，如 tag:ok-acme
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// 后台登录账号。role=super 看全部、可建组发账号；role=group 限本组（group_id）。
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // scrypt: <saltHex>:<hashHex>
  role: text('role', { enum: ['super', 'group'] })
    .notNull()
    .default('group'),
  groupId: integer('group_id'), // group 角色归属；super 为 null
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// 节点审批状态（headscale 没有 pending 概念，靠这张表补足伪审核）
export const nodeMeta = sqliteTable('node_meta', {
  headscaleId: text('headscale_id').primaryKey(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  firstSeen: text('first_seen')
    .notNull()
    .default(sql`(current_timestamp)`),
  approvedAt: text('approved_at'),
  approvedBy: text('approved_by'),
  note: text('note'),
})

// 操作审计
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: text('ts')
    .notNull()
    .default(sql`(current_timestamp)`),
  action: text('action').notNull(),
  target: text('target'),
  detail: text('detail'),
  groupId: integer('group_id'), // 归属组；super 的全局操作为 null
  actor: text('actor'), // 操作者 username
})

// preauthkey 明文备份（headscale 只在创建时返回一次明文，列表/CLI 都是掩码；
// 存这里才能事后为每个 key 拼完整安装命令。仅 120 本地 SQLite + 600 权限）
export const preauthKeys = sqliteTable('preauth_keys', {
  headscaleId: text('headscale_id').primaryKey(),
  key: text('key').notNull(),
  mode: text('mode', { enum: ['review', 'direct', 'plain'] })
    .notNull()
    .default('plain'),
  groupId: integer('group_id'), // 归属组
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

export type Group = typeof groups.$inferSelect
export type Admin = typeof admins.$inferSelect
export type NodeMeta = typeof nodeMeta.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type PreauthKey = typeof preauthKeys.$inferSelect
