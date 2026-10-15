import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { ComprehensionPrivate, ComprehensionPublic, ExtensionPrivate, ExtensionPublic, ReviewPrivate, ReviewPublic } from "@swemock/content";
import type { ProblemStatus } from "@/lib/dsa-types";
import type { FluencyType } from "@/lib/fluency-types";
import { getDb } from "../db";
import { contentItems } from "../db/schema";
import { problemStatuses } from "./repo";
import { ensureContentSynced, itemId } from "./sync";

export interface PublicOf {
  comprehension: ComprehensionPublic;
  review: ReviewPublic;
  extension: ExtensionPublic;
}
export interface PrivateOf {
  comprehension: ComprehensionPrivate;
  review: ReviewPrivate;
  extension: ExtensionPrivate;
}

export interface FluencyListItem {
  id: string;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  language: string;
  minutes: number;
  reviewed: boolean;
  status: ProblemStatus;
}

const ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export function listFluency(type: FluencyType): FluencyListItem[] {
  ensureContentSynced();
  const statuses = problemStatuses();
  return getDb()
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.type, type), isNull(contentItems.deletedAt)))
    .all()
    .map((r): FluencyListItem => {
      const pub = JSON.parse(r.publicJson) as { language: string; minutes: number };
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        difficulty: r.difficulty as FluencyListItem["difficulty"],
        tags: JSON.parse(r.tagsJson) as string[],
        language: pub.language,
        minutes: pub.minutes,
        reviewed: r.reviewed,
        status: statuses.get(r.id) ?? "unsolved",
      };
    })
    .sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty] || a.title.localeCompare(b.title));
}

export function getFluency<T extends FluencyType>(type: T, slug: string): { id: string; pub: PublicOf[T] } | null {
  ensureContentSynced();
  const row = getDb()
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, itemId(type, slug)), isNull(contentItems.deletedAt)))
    .get();
  return row ? { id: row.id, pub: JSON.parse(row.publicJson) as PublicOf[T] } : null;
}

/** Planted issues, hidden tests, reference code: callers reveal deliberately. */
export function getFluencyPrivate<T extends FluencyType>(type: T, slug: string): PrivateOf[T] | null {
  const row = getDb()
    .select({ privateJson: contentItems.privateJson })
    .from(contentItems)
    .where(and(eq(contentItems.id, itemId(type, slug)), isNull(contentItems.deletedAt)))
    .get();
  return row ? (JSON.parse(row.privateJson) as PrivateOf[T]) : null;
}

/** The type of a session's item, from its id ("review:slug"). */
export const parseItemId = (id: string): { type: FluencyType; slug: string } => {
  const [type, slug] = id.split(":");
  return { type: type as FluencyType, slug: slug! };
};
