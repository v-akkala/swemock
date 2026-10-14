import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { LldPrivate, LldPublic } from "@swemock/content";
import { getDb } from "../db";
import { contentItems } from "../db/schema";
import { ensureContentSynced, itemId } from "./sync";
import { problemStatuses } from "./repo";
import type { ProblemStatus } from "@/lib/dsa-types";

export interface LldListItem {
  id: string;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  format: "system" | "class";
  languages: string[];
  reviewed: boolean;
  status: ProblemStatus;
}

const ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export function listLld(): LldListItem[] {
  ensureContentSynced();
  const statuses = problemStatuses();
  return getDb()
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.type, "lld"), isNull(contentItems.deletedAt)))
    .all()
    .map((r): LldListItem => {
      const pub = JSON.parse(r.publicJson) as LldPublic;
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        difficulty: pub.difficulty,
        tags: JSON.parse(r.tagsJson) as string[],
        format: pub.format,
        languages: Object.keys(pub.languages),
        reviewed: r.reviewed,
        status: statuses.get(r.id) ?? "unsolved",
      };
    })
    .sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty] || a.title.localeCompare(b.title));
}

export function getLld(slug: string): { id: string; pub: LldPublic } | null {
  ensureContentSynced();
  const row = getDb()
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, itemId("lld", slug)), isNull(contentItems.deletedAt)))
    .get();
  return row ? { id: row.id, pub: JSON.parse(row.publicJson) as LldPublic } : null;
}

/** Hidden tests, reference files, design notes, the requirement change: callers reveal deliberately. */
export function getLldPrivate(slug: string): LldPrivate | null {
  const row = getDb()
    .select({ privateJson: contentItems.privateJson })
    .from(contentItems)
    .where(and(eq(contentItems.id, itemId("lld", slug)), isNull(contentItems.deletedAt)))
    .get();
  return row ? (JSON.parse(row.privateJson) as LldPrivate) : null;
}
