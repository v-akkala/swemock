import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { BehavioralPrivate, BehavioralPublic, CsPrivate, CsPublic } from "@swemock/content";
import { getDb } from "../db";
import { contentItems } from "../db/schema";
import { ensureContentSynced, itemId } from "./sync";

/** CS fundamentals and behavioral question banks (content types `cs` and `behavioral`). */

export type CsListItem = Pick<CsPublic, "slug" | "title" | "difficulty" | "topics" | "format"> & { id: string };
export type BehavioralListItem = Pick<BehavioralPublic, "slug" | "title" | "competencies" | "lenses"> & { id: string };

function rows(type: "cs" | "behavioral") {
  ensureContentSynced();
  return getDb()
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.type, type), isNull(contentItems.deletedAt)))
    .all();
}

export function listCs(): CsListItem[] {
  return rows("cs")
    .map((r) => {
      const p = JSON.parse(r.publicJson) as CsPublic;
      return { id: r.id, slug: r.slug, title: r.title, difficulty: p.difficulty, topics: p.topics, format: p.format };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function listBehavioral(): BehavioralListItem[] {
  return rows("behavioral")
    .map((r) => {
      const p = JSON.parse(r.publicJson) as BehavioralPublic;
      return { id: r.id, slug: r.slug, title: r.title, competencies: p.competencies, lenses: p.lenses };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function one(type: "cs" | "behavioral", slug: string) {
  ensureContentSynced();
  return (
    getDb()
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.id, itemId(type, slug)), isNull(contentItems.deletedAt)))
      .get() ?? null
  );
}

export const getCsPublic = (slug: string): CsPublic | null => {
  const r = one("cs", slug);
  return r ? (JSON.parse(r.publicJson) as CsPublic) : null;
};

/** Key points and model answers: callers decide exactly what to reveal and when. */
export const getCsPrivate = (slug: string): CsPrivate | null => {
  const r = one("cs", slug);
  return r ? (JSON.parse(r.privateJson) as CsPrivate) : null;
};

export const getBehavioralPublic = (slug: string): BehavioralPublic | null => {
  const r = one("behavioral", slug);
  return r ? (JSON.parse(r.publicJson) as BehavioralPublic) : null;
};

export const getBehavioralPrivate = (slug: string): BehavioralPrivate | null => {
  const r = one("behavioral", slug);
  return r ? (JSON.parse(r.privateJson) as BehavioralPrivate) : null;
};
