import { COMPETENCIES } from "./competencies";

export interface StoryTags {
  id: string;
  title: string;
  competencies: string[];
}

export interface Coverage {
  rows: { competency: string; label: string; storyIds: string[] }[];
  /** Competencies with no story at all. */
  gaps: string[];
  /** Competencies backed by exactly one story. */
  thin: string[];
  /** Stories carrying the whole load: the only story for 3 or more competencies. */
  overused: { storyId: string; title: string; soleFor: string[] }[];
}

/** How many competencies a single story may be the only answer for before it's flagged. */
export const OVERUSE_THRESHOLD = 3;

/** Competency × story coverage (spec §8.5): gaps, thin spots, and over-reliance on one story. */
export function coverage(stories: StoryTags[]): Coverage {
  const rows = COMPETENCIES.map((c) => ({
    competency: c.id as string,
    label: c.label as string,
    storyIds: stories.filter((s) => s.competencies.includes(c.id)).map((s) => s.id),
  }));
  const soleFor = new Map<string, string[]>();
  for (const r of rows) {
    if (r.storyIds.length === 1) soleFor.set(r.storyIds[0]!, [...(soleFor.get(r.storyIds[0]!) ?? []), r.competency]);
  }
  return {
    rows,
    gaps: rows.filter((r) => r.storyIds.length === 0).map((r) => r.competency),
    thin: rows.filter((r) => r.storyIds.length === 1).map((r) => r.competency),
    overused: [...soleFor.entries()]
      .filter(([, comps]) => comps.length >= OVERUSE_THRESHOLD)
      .map(([storyId, comps]) => ({ storyId, title: stories.find((s) => s.id === storyId)?.title ?? storyId, soleFor: comps })),
  };
}
