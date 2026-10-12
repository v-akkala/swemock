import "server-only";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { DAY_MS, applyAttempt, isDue, type AttemptOutcome, type CardState } from "@swemock/shared";
import { DEFAULT_USER_ID, getDb } from "../db";
import { contentItems, srsCards } from "../db/schema";

const MASTERED = "mastered";
const NEVER = 3650 * DAY_MS;

function cardWhere(itemId: string) {
  return and(eq(srsCards.userId, DEFAULT_USER_ID), eq(srsCards.itemId, itemId), eq(srsCards.cardKey, ""));
}

function toState(row: typeof srsCards.$inferSelect): CardState {
  return { intervalIdx: row.intervalIdx, dueAt: row.dueAt, mastered: row.lastResult === MASTERED };
}

/** Records how an attempt on a problem went and moves its review card accordingly. */
export function recordAttempt(itemId: string, outcome: AttemptOutcome, now = Date.now()): CardState | null {
  const db = getDb();
  const row = db.select().from(srsCards).where(cardWhere(itemId)).get();
  const next = applyAttempt(row ? toState(row) : null, outcome, now);
  if (!next) return null;
  const values = {
    intervalIdx: next.intervalIdx,
    dueAt: next.mastered ? now + NEVER : next.dueAt,
    lastResult: next.mastered ? MASTERED : outcome,
  };
  if (row) db.update(srsCards).set(values).where(eq(srsCards.id, row.id)).run();
  else db.insert(srsCards).values({ id: ulid(now), userId: DEFAULT_USER_ID, itemId, kind: "dsa", cardKey: "", ...values }).run();
  return next;
}

export interface DueReview {
  slug: string;
  title: string;
  difficulty: string | null;
  dueAt: number;
  intervalIdx: number;
}

export function dueReviews(now = Date.now()): DueReview[] {
  return getDb()
    .select({
      slug: contentItems.slug,
      title: contentItems.title,
      difficulty: contentItems.difficulty,
      dueAt: srsCards.dueAt,
      intervalIdx: srsCards.intervalIdx,
      lastResult: srsCards.lastResult,
      deletedAt: contentItems.deletedAt,
    })
    .from(srsCards)
    .innerJoin(contentItems, eq(contentItems.id, srsCards.itemId))
    .where(and(eq(srsCards.userId, DEFAULT_USER_ID), eq(srsCards.kind, "dsa")))
    .all()
    .filter((r) => r.deletedAt === null && isDue({ dueAt: r.dueAt, mastered: r.lastResult === MASTERED }, now))
    .map((r) => ({ slug: r.slug, title: r.title, difficulty: r.difficulty, dueAt: r.dueAt, intervalIdx: r.intervalIdx }))
    .sort((a, b) => a.dueAt - b.dueAt);
}

/** The review card for an item, if it has one (used by tests and the debrief). */
export function cardFor(itemId: string): (CardState & { lastResult: string | null }) | null {
  const row = getDb().select().from(srsCards).where(cardWhere(itemId)).get();
  return row ? { ...toState(row), lastResult: row.lastResult } : null;
}
