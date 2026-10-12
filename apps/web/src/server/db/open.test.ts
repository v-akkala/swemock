import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKUPS_TO_KEEP, openDatabase } from "./open";
import { readSettings, updateSettings } from "../settings";

const migrations = path.resolve(import.meta.dirname, "../../../drizzle");
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-db-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("creates a fresh database without a backup", () => {
    const { sqlite, backupPath } = openDatabase(dir, migrations);
    expect(backupPath).toBeNull();
    const user = sqlite.prepare("select id from users").get();
    expect(user).toEqual({ id: "default" });
    sqlite.close();
  });

  it("backs up an existing database and keeps user data across reopen", () => {
    const first = openDatabase(dir, migrations);
    updateSettings(first.db, { provider: "ollama" });
    first.sqlite.close();

    const second = openDatabase(dir, migrations, new Date("2026-01-01T00:00:00Z"));
    expect(second.backupPath).toMatch(/swemock-20260101T000000Z\.db$/);
    expect(fs.existsSync(second.backupPath!)).toBe(true);
    expect(readSettings(second.db).provider).toBe("ollama");
    second.sqlite.close();
  });

  it(`keeps at most ${BACKUPS_TO_KEEP} backups`, () => {
    openDatabase(dir, migrations).sqlite.close();
    for (let i = 0; i < BACKUPS_TO_KEEP + 3; i++) {
      openDatabase(dir, migrations, new Date(Date.UTC(2026, 0, 1, 0, 0, i))).sqlite.close();
    }
    const backups = fs.readdirSync(path.join(dir, "backups"));
    expect(backups).toHaveLength(BACKUPS_TO_KEEP);
    expect(backups.sort()[0]).toBe("swemock-20260101T000003Z.db");
  });
});
