import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const DB_FILE = "swemock.db";
export const BACKUP_DIR = "backups";
export const BACKUPS_TO_KEEP = 10;
export const DEFAULT_USER_ID = "default";

export interface OpenResult {
  db: Db;
  sqlite: Database.Database;
  backupPath: string | null;
}

/**
 * Opens the database in `dir`: backs up any existing database, runs pending migrations,
 * and ensures the default user exists. Never deletes user data.
 */
export function openDatabase(dir: string, migrationsFolder: string, now = new Date()): OpenResult {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, DB_FILE);
  const existed = fs.existsSync(file) && fs.statSync(file).size > 0;

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const backupPath = existed ? backupDatabase(sqlite, dir, now) : null;

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  db.insert(schema.users).values({ id: DEFAULT_USER_ID, name: "You" }).onConflictDoNothing().run();

  return { db, sqlite, backupPath };
}

function backupDatabase(sqlite: Database.Database, dir: string, now: Date): string {
  const backupDir = path.join(dir, BACKUP_DIR);
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  let target = path.join(backupDir, `swemock-${stamp}.db`);
  for (let n = 1; fs.existsSync(target); n++) {
    target = path.join(backupDir, `swemock-${stamp}-${n}.db`);
  }
  // VACUUM INTO writes a consistent, compacted copy even with WAL enabled.
  sqlite.prepare("VACUUM INTO ?").run(target);
  pruneBackups(backupDir);
  return target;
}

function pruneBackups(backupDir: string): void {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => /^swemock-.*\.db$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - BACKUPS_TO_KEEP))) {
    fs.rmSync(path.join(backupDir, f));
  }
}
