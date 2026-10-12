import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type { Language } from "@swemock/shared";
import type { RunResponse } from "@/lib/dsa-types";
import { DEFAULT_USER_ID, getDb } from "../db";
import { drafts, events, EVENT_KINDS, sessions, submissions } from "../db/schema";
import { readSettings } from "../settings";

type EventKind = (typeof EVENT_KINDS)[number];
export type SessionRow = typeof sessions.$inferSelect;

export function startSession(opts: {
  itemId?: string | null;
  mode: "practice" | "oa" | "interview";
  driver?: "scripted" | "llm";
  state?: unknown;
  roundType?: string;
  now?: number;
}): SessionRow {
  const db = getDb();
  const now = opts.now ?? Date.now();
  const row = {
    id: ulid(now),
    userId: DEFAULT_USER_ID,
    roundType: opts.roundType ?? "dsa",
    itemId: opts.itemId ?? null,
    mode: opts.mode,
    driver: opts.driver ?? ("scripted" as const),
    provider: readSettings(db).provider,
    loopId: null,
    status: "active" as const,
    phasePlanJson: "[]",
    stateJson: JSON.stringify(opts.state ?? {}),
    startedAt: now,
    endedAt: null,
  };
  db.insert(sessions).values(row).run();
  return db.select().from(sessions).where(eq(sessions.id, row.id)).get()!;
}

export function getSession(id: string): SessionRow | null {
  return getDb().select().from(sessions).where(eq(sessions.id, id)).get() ?? null;
}

export function activePracticeSession(itemId: string): SessionRow | null {
  return (
    getDb()
      .select()
      .from(sessions)
      .where(and(eq(sessions.itemId, itemId), eq(sessions.mode, "practice"), eq(sessions.status, "active")))
      .orderBy(desc(sessions.startedAt))
      .limit(1)
      .get() ?? null
  );
}

export function endSession(id: string, status: "ended" | "abandoned", now = Date.now()): void {
  getDb().update(sessions).set({ status, endedAt: now }).where(and(eq(sessions.id, id), eq(sessions.status, "active"))).run();
}

export function addEvent(sessionId: string, kind: EventKind, payload: unknown, now = Date.now()): void {
  getDb()
    .insert(events)
    .values({ id: ulid(now), sessionId, ts: now, kind, payloadJson: JSON.stringify(payload) })
    .run();
}

export interface EventRow<P = Record<string, unknown>> {
  ts: number;
  kind: EventKind;
  payload: P;
}

export function sessionEvents<P = Record<string, unknown>>(sessionId: string, kind?: EventKind): EventRow<P>[] {
  const where = kind ? and(eq(events.sessionId, sessionId), eq(events.kind, kind)) : eq(events.sessionId, sessionId);
  return getDb()
    .select()
    .from(events)
    .where(where)
    .orderBy(asc(events.ts), asc(events.id))
    .all()
    .map((e) => ({ ts: e.ts, kind: e.kind, payload: JSON.parse(e.payloadJson) as P }));
}

// ---- drafts -------------------------------------------------------------------------------------

function draftWhere(itemId: string, language: string, sessionId: string | null) {
  return and(
    eq(drafts.userId, DEFAULT_USER_ID),
    eq(drafts.itemId, itemId),
    eq(drafts.language, language),
    sessionId ? eq(drafts.sessionId, sessionId) : isNull(drafts.sessionId),
  );
}

export function loadDrafts(itemId: string, sessionId: string | null): Partial<Record<Language, string>> {
  const rows = getDb()
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.userId, DEFAULT_USER_ID),
        eq(drafts.itemId, itemId),
        sessionId ? eq(drafts.sessionId, sessionId) : isNull(drafts.sessionId),
      ),
    )
    .all();
  const out: Partial<Record<Language, string>> = {};
  for (const r of rows) {
    if (r.language) out[r.language as Language] = (JSON.parse(r.filesJson) as { code: string }).code;
  }
  return out;
}

export function saveDraft(itemId: string, language: Language, code: string, sessionId: string | null, now = Date.now()): void {
  const db = getDb();
  const filesJson = JSON.stringify({ code });
  const existing = db.select({ id: drafts.id }).from(drafts).where(draftWhere(itemId, language, sessionId)).get();
  if (existing) db.update(drafts).set({ filesJson, updatedAt: now }).where(eq(drafts.id, existing.id)).run();
  else {
    db.insert(drafts)
      .values({ id: ulid(now), userId: DEFAULT_USER_ID, itemId, sessionId, language, filesJson, updatedAt: now })
      .run();
  }
}

// ---- submissions --------------------------------------------------------------------------------

export function recordSubmission(opts: {
  sessionId: string;
  itemId: string;
  language: Language;
  response: RunResponse;
}): void {
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
      verdict: r.verdict,
      passed: r.passed,
      total: r.total,
      // Stored in the same masked form the browser received, so history never exposes hidden tests.
      resultsJson: JSON.stringify({ tests: r.tests, compileOutput: r.compileOutput, efficiency: r.efficiency ?? null }),
      runtimeMs: r.maxTimeMs,
      memoryKb: r.maxMemoryKb === null ? null : Math.round(r.maxMemoryKb),
    })
    .run();
}
