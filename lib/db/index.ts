import 'server-only'

import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { auditLog } from './schema'
import * as schema from './schema'
import { requiredEnv } from '@/lib/env'

function createDb() {
  const dbFile = requiredEnv('DATABASE_URL').replace(/^file:/, '')

  const dir = dirname(/* turbopackIgnore: true */ dbFile)
  if (dir && !existsSync(/* turbopackIgnore: true */ dir)) {
    mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 })
  }

  const sqlite = new Database(/* turbopackIgnore: true */ dbFile)
  sqlite.pragma('journal_mode = WAL')

  // 明文 preauthkey 落库，收紧文件权限（目录 700 + 库文件 600）
  try {
    if (dir) chmodSync(/* turbopackIgnore: true */ dir, 0o700)
    for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
      if (existsSync(/* turbopackIgnore: true */ f)) {
        chmodSync(/* turbopackIgnore: true */ f, 0o600)
      }
    }
  } catch {
    // 权限收紧失败不阻断启动（如非 owner），仅尽力而为
  }

  const instance = drizzle(sqlite, { schema })

  // 轻量自建表（不引 drizzle-kit migration，启动即建）
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  hs_user_id  TEXT NOT NULL,
  hs_user_name TEXT NOT NULL,
  ok_tag      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'group',
  group_id      INTEGER,
  created_at    TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE TABLE IF NOT EXISTS node_meta (
  headscale_id TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'pending',
  first_seen   TEXT NOT NULL DEFAULT (current_timestamp),
  approved_at  TEXT,
  approved_by  TEXT,
  note         TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     TEXT NOT NULL DEFAULT (current_timestamp),
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS preauth_keys (
  headscale_id TEXT PRIMARY KEY,
  key          TEXT NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'plain',
  created_at   TEXT NOT NULL DEFAULT (current_timestamp)
);
`)

  // 给已存在的旧库幂等补列（sqlite 无 ADD COLUMN IF NOT EXISTS，先查 table_info）
  function addColumnIfMissing(table: string, column: string, ddl: string) {
    const cols = sqlite
      .prepare(`PRAGMA table_info(${table})`)
      .all() as { name: string }[]
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    }
  }

  addColumnIfMissing('preauth_keys', 'group_id', 'group_id INTEGER')
  addColumnIfMissing('audit_log', 'group_id', 'group_id INTEGER')
  addColumnIfMissing('audit_log', 'actor', 'actor TEXT')
  addColumnIfMissing('groups', 'hs_user_name', 'hs_user_name TEXT')
  sqlite.exec('UPDATE groups SET hs_user_name = slug WHERE hs_user_name IS NULL')

  return instance
}

type Db = ReturnType<typeof createDb>

let dbInstance: Db | null = null

export function getDb(): Db {
  dbInstance ??= createDb()
  return dbInstance
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = getDb()
    const value = Reflect.get(instance, prop, receiver)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export async function audit(
  action: string,
  target?: string,
  detail?: string,
  opts?: { groupId?: number | null; actor?: string | null },
) {
  try {
    db.insert(auditLog)
      .values({
        action,
        target,
        detail,
        groupId: opts?.groupId ?? null,
        actor: opts?.actor ?? null,
      })
      .run()
  } catch {
    // 审计失败不应阻断主流程
  }
}

export { schema }
