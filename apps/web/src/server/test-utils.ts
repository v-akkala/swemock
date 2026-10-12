import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Points the server modules at a throwaway database and the real content directory.
 * Call before importing anything that uses getDb(), and again between tests for a clean slate.
 */
export function freshTempDatabase(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-test-"));
  process.env.SWEMOCK_DATA_DIR = dir;
  process.env.SWEMOCK_MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../drizzle");
  process.env.SWEMOCK_CONTENT_DIR = path.resolve(import.meta.dirname, "../../../../content");
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__swemockDb;
  delete g.__swemockContent;
  return dir;
}
