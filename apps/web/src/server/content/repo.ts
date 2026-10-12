import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { DsaPrivate, DsaPublic } from "@swemock/content";
import type { ProblemStatus } from "@/lib/dsa-types";
import { DEFAULT_USER_ID, getDb } from "../db";
import { contentItems, submissions } from "../db/schema";
import { ensureContentSynced, itemId } from "./sync";

export interface DsaListItem {
  id: string;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  companies: string[];
  reviewed: boolean;
  status: ProblemStatus;
}

export interface DsaFilters {
  tag?: string;
  difficulty?: string;
  status?: string;
  company?: string;
  q?: string;
}

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

/** Per-item status from the user's submissions: solved (an accepted submit) or attempted (any run/submit). */
export function problemStatuses(userId = DEFAULT_USER_ID): Map<string, ProblemStatus> {
  const rows = getDb()
    .select({ itemId: submissions.itemId, kind: submissions.kind, verdict: submissions.verdict })
    .from(submissions)
    .where(eq(submissions.userId, userId))
    .all();
  const out = new Map<string, ProblemStatus>();
  for (const r of rows) {
    if (!r.itemId) continue;
    if (r.kind === "submit" && r.verdict === "accepted") out.set(r.itemId, "solved");
    else if (out.get(r.itemId) !== "solved") out.set(r.itemId, "attempted");
  }
  return out;
}

export function listDsa(filters: DsaFilters = {}): DsaListItem[] {
  ensureContentSynced();
  const db = getDb();
  const statuses = problemStatuses();
  const q = filters.q?.trim().toLowerCase();
  const items = db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.type, "dsa"), isNull(contentItems.deletedAt)))
    .all()
    .map((r): DsaListItem => {
      const pub = JSON.parse(r.publicJson) as DsaPublic;
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        difficulty: r.difficulty as DsaListItem["difficulty"],
        tags: JSON.parse(r.tagsJson) as string[],
        companies: pub.companies,
        reviewed: r.reviewed,
        status: statuses.get(r.id) ?? "unsolved",
      };
    });
  return items
    .filter((i) => !filters.tag || i.tags.includes(filters.tag))
    .filter((i) => !filters.difficulty || i.difficulty === filters.difficulty)
    .filter((i) => !filters.status || i.status === filters.status)
    .filter((i) => !filters.company || i.companies.includes(filters.company))
    .filter((i) => !q || i.title.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q)))
    .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.title.localeCompare(b.title));
}

export function dsaFacets(): { tags: string[]; companies: string[] } {
  const items = listDsa();
  return {
    tags: [...new Set(items.flatMap((i) => i.tags))].sort(),
    companies: [...new Set(items.flatMap((i) => i.companies))].sort(),
  };
}

export function getDsa(slug: string): { id: string; pub: DsaPublic; version: number; contentHash: string } | null {
  ensureContentSynced();
  const row = getDb()
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, itemId("dsa", slug)), isNull(contentItems.deletedAt)))
    .get();
  if (!row) return null;
  return { id: row.id, pub: JSON.parse(row.publicJson) as DsaPublic, version: row.version, contentHash: row.contentHash };
}

/**
 * Reference solutions, hidden tests, hints, editorial. Never returned to the browser directly: callers
 * pick exactly what to reveal (see server/dsa/service.ts).
 */
export function getDsaPrivate(slug: string): DsaPrivate | null {
  const row = getDb()
    .select({ privateJson: contentItems.privateJson })
    .from(contentItems)
    .where(and(eq(contentItems.id, itemId("dsa", slug)), isNull(contentItems.deletedAt)))
    .get();
  return row ? (JSON.parse(row.privateJson) as DsaPrivate) : null;
}

export function listUnreviewed() {
  ensureContentSynced();
  return getDb()
    .select({
      id: contentItems.id,
      type: contentItems.type,
      slug: contentItems.slug,
      title: contentItems.title,
      difficulty: contentItems.difficulty,
      version: contentItems.version,
      source: contentItems.source,
    })
    .from(contentItems)
    .where(and(eq(contentItems.reviewed, false), isNull(contentItems.deletedAt)))
    .all();
}

export function countReviewed(): { reviewed: number; total: number } {
  const rows = getDb().select({ reviewed: contentItems.reviewed }).from(contentItems).where(isNull(contentItems.deletedAt)).all();
  return { reviewed: rows.filter((r) => r.reviewed).length, total: rows.length };
}

export function approveItem(id: string): boolean {
  const res = getDb().update(contentItems).set({ reviewed: true }).where(eq(contentItems.id, id)).run();
  return res.changes > 0;
}
