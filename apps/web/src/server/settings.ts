import "server-only";
import { eq } from "drizzle-orm";
import { normalizeSettings, type Settings, type SettingsPatch } from "@swemock/shared";
import type { Db } from "./db";
import { settings as settingsTable } from "./db/schema";

const KEY = "app";

export function readSettings(db: Db): Settings {
  const row = db.select().from(settingsTable).where(eq(settingsTable.key, KEY)).get();
  return normalizeSettings(row ? JSON.parse(row.valueJson) : null);
}

export function updateSettings(db: Db, patch: SettingsPatch): Settings {
  const next = normalizeSettings({ ...readSettings(db), ...patch });
  const valueJson = JSON.stringify(next);
  const updatedAt = Date.now();
  db.insert(settingsTable)
    .values({ key: KEY, valueJson, updatedAt })
    .onConflictDoUpdate({ target: settingsTable.key, set: { valueJson, updatedAt } })
    .run();
  return next;
}
