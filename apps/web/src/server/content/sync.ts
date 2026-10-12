import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { fingerprintTree, loadContentDir, toStored } from "@swemock/content";
import { contentDir } from "../config";
import { getDb } from "../db";
import type { Db } from "../db/open";
import { contentItems } from "../db/schema";

export interface SyncSummary {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: number;
  errors: string[];
}

export const itemId = (type: string, slug: string) => `${type}:${slug}`;

/** Loads every item under `root` and brings the content_items table in line with it. */
export function syncContent(db: Db, root: string, now = Date.now()): SyncSummary {
  const { items, errors } = loadContentDir(root);
  const summary: SyncSummary = { added: [], updated: [], removed: [], unchanged: 0, errors: errors.map((e) => e.message) };

  db.transaction((tx) => {
    const existing = new Map(tx.select().from(contentItems).all().map((r) => [r.id, r]));
    const seen = new Set<string>();

    for (const item of items) {
      const stored = toStored(item);
      const id = itemId(stored.type, stored.slug);
      seen.add(id);
      const row = existing.get(id);
      const fields = {
        version: stored.version,
        title: stored.title,
        difficulty: stored.difficulty,
        tagsJson: JSON.stringify(stored.tags),
        publicJson: stored.publicJson,
        privateJson: stored.privateJson,
        source: stored.source,
        reviewed: stored.reviewed,
        contentHash: stored.contentHash,
        deletedAt: null,
        updatedAt: now,
      };
      if (!row) {
        tx.insert(contentItems).values({ id, type: stored.type, slug: stored.slug, ...fields }).run();
        summary.added.push(id);
      } else if (row.contentHash !== stored.contentHash) {
        tx.update(contentItems).set(fields).where(eq(contentItems.id, id)).run();
        summary.updated.push(id);
      } else {
        if (row.deletedAt !== null) tx.update(contentItems).set({ deletedAt: null }).where(eq(contentItems.id, id)).run();
        summary.unchanged++;
      }
    }

    // Items that vanished from disk are hidden, not deleted: attempts and history still point at them.
    const gone = [...existing.values()].filter((r) => !seen.has(r.id) && r.deletedAt === null).map((r) => r.id);
    if (gone.length) {
      tx.update(contentItems).set({ deletedAt: now }).where(inArray(contentItems.id, gone)).run();
      summary.removed.push(...gone);
    }
  });

  return summary;
}

const state = globalThis as unknown as { __swemockContent?: { fingerprint: string | null; checkedAt: number } };
const CHECK_INTERVAL_MS = 2000;

/**
 * Re-syncs when files under the content directory changed. Cheap enough to call on every request:
 * it stats the tree at most once every couple of seconds. This is how a new problem shows up in the
 * running app without a restart.
 */
export function ensureContentSynced(opts: { force?: boolean } = {}): SyncSummary | null {
  const s = (state.__swemockContent ??= { fingerprint: null, checkedAt: 0 });
  const now = Date.now();
  if (!opts.force && now - s.checkedAt < CHECK_INTERVAL_MS) return null;
  s.checkedAt = now;
  const root = contentDir();
  const fingerprint = fingerprintTree(root);
  if (!opts.force && fingerprint === s.fingerprint) return null;
  s.fingerprint = fingerprint;
  const summary = syncContent(getDb(), root, now);
  for (const e of summary.errors) console.error(`[swemock] content error: ${e}`);
  if (summary.added.length || summary.updated.length || summary.removed.length) {
    console.log(
      `[swemock] content synced: +${summary.added.length} ~${summary.updated.length} -${summary.removed.length} (${summary.unchanged} unchanged)`,
    );
  }
  return summary;
}

export function liveItems(db: Db, type: string) {
  return db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.type, type), isNull(contentItems.deletedAt)))
    .all();
}
