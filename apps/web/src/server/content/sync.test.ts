import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { freshTempDatabase } from "../test-utils";

const REAL = path.resolve(import.meta.dirname, "../../../../../content");

/** A content root holding copies of the named real problems, so tests can edit files freely. */
function copyContent(...slugs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-content-"));
  for (const slug of slugs) fs.cpSync(path.join(REAL, "dsa", slug), path.join(root, "dsa", slug), { recursive: true });
  return root;
}

async function load() {
  freshTempDatabase();
  const { getDb } = await import("../db");
  const sync = await import("./sync");
  const repo = await import("./repo");
  return { db: getDb(), ...sync, ...repo };
}

describe("content sync", () => {
  beforeEach(() => {
    freshTempDatabase();
  });

  it("adds new items, leaves unchanged ones alone, and soft-deletes vanished ones", async () => {
    const { db, syncContent } = await load();
    const root = copyContent("balanced-brackets", "merge-ranges");

    let s = syncContent(db, root);
    expect(s.added.sort()).toEqual(["dsa:balanced-brackets", "dsa:merge-ranges"]);
    expect(s.errors).toEqual([]);

    s = syncContent(db, root);
    expect(s).toMatchObject({ added: [], updated: [], removed: [], unchanged: 2 });

    fs.rmSync(path.join(root, "dsa/merge-ranges"), { recursive: true });
    s = syncContent(db, root);
    expect(s.removed).toEqual(["dsa:merge-ranges"]);

    // It comes back when the folder returns.
    fs.cpSync(path.join(REAL, "dsa/merge-ranges"), path.join(root, "dsa/merge-ranges"), { recursive: true });
    s = syncContent(db, root);
    expect(s.unchanged).toBe(2);
  });

  it("re-reads an item when any of its files change, and resets approval", async () => {
    const { db, syncContent, approveItem, listUnreviewed } = await load();
    const root = copyContent("balanced-brackets");
    process.env.SWEMOCK_CONTENT_DIR = root; // repo functions re-sync from the configured directory
    syncContent(db, root);
    expect(listUnreviewed().map((i) => i.id)).toEqual(["dsa:balanced-brackets"]);

    expect(approveItem("dsa:balanced-brackets")).toBe(true);
    expect(listUnreviewed()).toEqual([]);
    syncContent(db, root); // same hash: approval is kept
    expect(listUnreviewed()).toEqual([]);

    const statement = path.join(root, "dsa/balanced-brackets/statement.md");
    fs.appendFileSync(statement, "\nAn extra sentence.\n");
    const s = syncContent(db, root);
    expect(s.updated).toEqual(["dsa:balanced-brackets"]);
    expect(listUnreviewed().map((i) => i.id)).toEqual(["dsa:balanced-brackets"]); // changed content needs review again
  });

  it("reports a broken item without losing the good ones", async () => {
    const { db, syncContent } = await load();
    const root = copyContent("balanced-brackets", "merge-ranges");
    fs.writeFileSync(path.join(root, "dsa/merge-ranges/problem.yaml"), "title: [");
    const s = syncContent(db, root);
    expect(s.added).toEqual(["dsa:balanced-brackets"]);
    expect(s.errors.join()).toContain("merge-ranges");
  });

  it("picks up new content in a running app without a restart", async () => {
    const { ensureContentSynced, listDsa } = await load();
    const root = copyContent("balanced-brackets");
    process.env.SWEMOCK_CONTENT_DIR = root;
    ensureContentSynced({ force: true });
    expect(listDsa().map((p) => p.slug)).toEqual(["balanced-brackets"]);

    fs.cpSync(path.join(REAL, "dsa/island-count"), path.join(root, "dsa/island-count"), { recursive: true });
    ensureContentSynced({ force: true });
    expect(listDsa().map((p) => p.slug).sort()).toEqual(["balanced-brackets", "island-count"]);
  });

  it("filters and orders the problem list", async () => {
    const { ensureContentSynced, listDsa, dsaFacets } = await load();
    ensureContentSynced({ force: true });
    const all = listDsa();
    expect(all.length).toBe(fs.readdirSync(path.join(REAL, "dsa")).length);
    expect(all.map((p) => p.difficulty)).toEqual([...all.map((p) => p.difficulty)].sort((a, b) => ["easy", "medium", "hard"].indexOf(a) - ["easy", "medium", "hard"].indexOf(b)));
    expect(listDsa({ difficulty: "hard" })).toHaveLength(3);
    expect(listDsa({ tag: "design" }).map((p) => p.slug).sort()).toEqual(["range-sums-with-updates", "recency-cache"]);
    expect(listDsa({ q: "island" }).map((p) => p.slug)).toEqual(["island-count"]);
    expect(listDsa({ status: "solved" })).toEqual([]);
    expect(dsaFacets().tags).toContain("dp");
  });
});
