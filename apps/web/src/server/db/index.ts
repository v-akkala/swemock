import "server-only";
import { dataDir, migrationsDir } from "../config";
import { openDatabase, type Db } from "./open";

export { DEFAULT_USER_ID, type Db } from "./open";

const globalForDb = globalThis as unknown as { __swemockDb?: Db };

/** Process-wide database handle. First call backs up and migrates (see openDatabase). */
export function getDb(): Db {
  if (!globalForDb.__swemockDb) {
    const { db, backupPath } = openDatabase(dataDir(), migrationsDir());
    if (backupPath) console.log(`[swemock] database backed up to ${backupPath}`);
    globalForDb.__swemockDb = db;
  }
  return globalForDb.__swemockDb;
}
