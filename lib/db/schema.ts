import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Admin login account. Every account manages the whole tailnet.
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // scrypt: <saltHex>:<hashHex>
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
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

export type Admin = typeof admins.$inferSelect
export type NodeMeta = typeof nodeMeta.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type PreauthKey = typeof preauthKeys.$inferSelect
