import "server-only";
import { desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { COMPETENCY_IDS, coverage, type Coverage } from "@swemock/shared";
import { DEFAULT_USER_ID, getDb } from "./db";
import { stories } from "./db/schema";
import { ApiError } from "./http/errors";

/** The story bank (spec §8.5): STAR stories with metrics, reflection, and competency tags. */

const text = z.string().trim().max(4000).default("");
export const storyInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  situation: text,
  task: text,
  action: text,
  result: text,
  metrics: z.string().trim().max(1000).default(""),
  reflection: text,
  competencies: z.array(z.enum(COMPETENCY_IDS)).max(8).default([]),
});
export type StoryInput = z.infer<typeof storyInputSchema>;

export interface StoryView extends StoryInput {
  id: string;
  updatedAt: number;
}

function toView(r: typeof stories.$inferSelect): StoryView {
  return {
    id: r.id,
    title: r.title,
    situation: r.situation,
    task: r.task,
    action: r.action,
    result: r.result,
    metrics: r.metrics,
    reflection: r.reflection,
    competencies: JSON.parse(r.competenciesJson) as StoryInput["competencies"],
    updatedAt: r.updatedAt,
  };
}

export function listStories(): StoryView[] {
  return getDb().select().from(stories).where(eq(stories.userId, DEFAULT_USER_ID)).orderBy(desc(stories.updatedAt)).all().map(toView);
}

export function saveStory(input: StoryInput, id?: string, now = Date.now()): StoryView {
  const db = getDb();
  const values = {
    title: input.title,
    situation: input.situation,
    task: input.task,
    action: input.action,
    result: input.result,
    metrics: input.metrics,
    reflection: input.reflection,
    competenciesJson: JSON.stringify([...new Set(input.competencies)]),
    updatedAt: now,
  };
  if (id) {
    const res = db.update(stories).set(values).where(eq(stories.id, id)).run();
    if (res.changes === 0) throw new ApiError(404, "That story doesn't exist.");
    return toView(db.select().from(stories).where(eq(stories.id, id)).get()!);
  }
  const row = { id: ulid(now), userId: DEFAULT_USER_ID, ...values };
  db.insert(stories).values(row).run();
  return toView(db.select().from(stories).where(eq(stories.id, row.id)).get()!);
}

export function deleteStory(id: string): void {
  getDb().delete(stories).where(eq(stories.id, id)).run();
}

export function storyCoverage(): { stories: StoryView[]; coverage: Coverage } {
  const all = listStories();
  return { stories: all, coverage: coverage(all.map((s) => ({ id: s.id, title: s.title, competencies: s.competencies }))) };
}

/** Compact text for packets and prompts: the facts the candidate has written down for these competencies. */
export function storiesForPrompt(competencies: string[]): string {
  const matching = listStories().filter((s) => s.competencies.some((c) => competencies.includes(c)));
  return matching
    .map((s) =>
      [
        `### ${s.title}`,
        s.situation && `Situation: ${s.situation}`,
        s.task && `Task: ${s.task}`,
        s.action && `Action: ${s.action}`,
        s.result && `Result: ${s.result}`,
        s.metrics && `Metrics: ${s.metrics}`,
        s.reflection && `Reflection: ${s.reflection}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}
