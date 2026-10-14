import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type { Language } from "@swemock/shared";
import { DEFAULT_USER_ID, getDb } from "../db";
import { drafts, submissions } from "../db/schema";
import type { LldRunResponse } from "@/lib/lld-types";

type Files = Record<string, string>;

function where(itemId: string, language: string, sessionId: string | null) {
  return and(
    eq(drafts.userId, DEFAULT_USER_ID),
    eq(drafts.itemId, itemId),
    eq(drafts.language, language),
    sessionId ? eq(drafts.sessionId, sessionId) : isNull(drafts.sessionId),
  );
}

export function loadLldDrafts(itemId: string, sessionId: string | null): Partial<Record<Language, Files>> {
  const rows = getDb()
    .select()
    .from(drafts)
    .where(and(eq(drafts.userId, DEFAULT_USER_ID), eq(drafts.itemId, itemId), sessionId ? eq(drafts.sessionId, sessionId) : isNull(drafts.sessionId)))
    .all();
  const out: Partial<Record<Language, Files>> = {};
  for (const r of rows) if (r.language) out[r.language as Language] = (JSON.parse(r.filesJson) as { files: Files }).files;
  return out;
}

export function saveLldDraft(itemId: string, language: Language, files: Files, sessionId: string | null, now = Date.now()): void {
  const db = getDb();
  const filesJson = JSON.stringify({ files });
  const existing = db.select({ id: drafts.id }).from(drafts).where(where(itemId, language, sessionId)).get();
  if (existing) db.update(drafts).set({ filesJson, updatedAt: now }).where(eq(drafts.id, existing.id)).run();
  else db.insert(drafts).values({ id: ulid(now), userId: DEFAULT_USER_ID, itemId, sessionId, language, filesJson, updatedAt: now }).run();
}

/** Stored in the same masked form the browser received, so history never exposes hidden tests. */
export function recordLldSubmission(opts: { sessionId: string; itemId: string; language: Language; response: LldRunResponse }): void {
  const r = opts.response;
  getDb()
    .insert(submissions)
    .values({
      id: ulid(),
      sessionId: opts.sessionId,
      userId: DEFAULT_USER_ID,
      itemId: opts.itemId,
      language: opts.language,
      kind: r.kind,
      verdict: r.solved ? "accepted" : r.buildError ? "compile_error" : "wrong_answer",
      passed: r.passed,
      total: r.total,
      resultsJson: JSON.stringify({ tests: r.tests, counts: r.counts, buildError: r.buildError }),
      runtimeMs: r.durationMs,
      memoryKb: null,
    })
    .run();
}

/** The candidate's most recently saved files in an interview session (any language). */
export function latestLldFiles(sessionId: string): { language: Language; files: Files } | null {
  const row = getDb().select().from(drafts).where(eq(drafts.sessionId, sessionId)).orderBy(desc(drafts.updatedAt)).limit(1).get();
  if (!row?.language) return null;
  return { language: row.language as Language, files: (JSON.parse(row.filesJson) as { files: Files }).files };
}
