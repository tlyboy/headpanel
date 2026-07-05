import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Group/tenant. Each group maps to a headscale user (namespace) as its ownership boundary,
// and an ok_tag (e.g. tag:ok-acme) as the intra-group connectivity pass (ACLs allow nodes in the same group to communicate based on this tag).
export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(), // panel group slug
  name: text('name').notNull(), // Display name
  hsUserId: text('hs_user_id').notNull(), // headscale user id
  hsUserName: text('hs_user_name').notNull(), // headscale user name for policy owners
  okTag: text('ok_tag').notNull(), // Connectivity pass tag, e.g. tag:ok-acme
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// Admin login account. role=super can see everything, create groups, and issue accounts; role=group is limited to its group (group_id).
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // scrypt: <saltHex>:<hashHex>
  role: text('role', { enum: ['super', 'group'] })
    .notNull()
    .default('group'),
  groupId: integer('group_id'), // Group for the role; null for super
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// Node approval status (headscale has no pending concept, so this table provides a simulated approval workflow)
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

// Operation audit log
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: text('ts')
    .notNull()
    .default(sql`(current_timestamp)`),
  action: text('action').notNull(),
  target: text('target'),
  detail: text('detail'),
  groupId: integer('group_id'), // Owning group; null for global operations by super
  actor: text('actor'), // Operator username
})

// Plaintext backup of preauthkeys (headscale returns plaintext only once at creation; lists/CLI show masked values;
// storing it here lets us assemble a complete installation command for each key later. Only local SQLite with 120 permissions + 600 permissions)
export const preauthKeys = sqliteTable('preauth_keys', {
  headscaleId: text('headscale_id').primaryKey(),
  key: text('key').notNull(),
  mode: text('mode', { enum: ['review', 'direct', 'plain'] })
    .notNull()
    .default('plain'),
  groupId: integer('group_id'), // Owning group
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

export type Group = typeof groups.$inferSelect
export type Admin = typeof admins.$inferSelect
export type NodeMeta = typeof nodeMeta.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type PreauthKey = typeof preauthKeys.$inferSelect
