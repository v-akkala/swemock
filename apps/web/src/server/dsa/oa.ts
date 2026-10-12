import "server-only";
import type { DsaListItem } from "../content/repo";
import { listDsa } from "../content/repo";
import { endSession, getSession, sessionEvents, startSession, type SessionRow } from "./store";

/** HackerRank-style online assessment: two problems, one clock, no interviewer, partial credit. */
export const OA_MIXES = {
  "easy-medium": ["easy", "medium"],
  "medium-medium": ["medium", "medium"],
  "medium-hard": ["medium", "hard"],
} as const;
export type OaMix = keyof typeof OA_MIXES;
export const OA_DURATIONS = [70, 80, 90] as const;

export interface OaState {
  slugs: string[];
  durationMs: number;
  deadline: number;
}

export function pickProblems(mix: OaMix, items: DsaListItem[], rng: () => number = Math.random): DsaListItem[] {
  const chosen: DsaListItem[] = [];
  for (const difficulty of OA_MIXES[mix]) {
    const pool = items.filter((i) => i.difficulty === difficulty && !chosen.some((c) => c.slug === i.slug));
    // Prefer problems the user hasn't solved yet; fall back to any with that difficulty.
    const fresh = pool.filter((i) => i.status !== "solved");
    const from = fresh.length ? fresh : pool;
    if (from.length) chosen.push(from[Math.floor(rng() * from.length)]!);
  }
  // Not enough problems of the requested difficulties: fill from anything left.
  const rest = items.filter((i) => !chosen.some((c) => c.slug === i.slug));
  while (chosen.length < 2 && rest.length) chosen.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]!);
  return chosen;
}

export function createOa(opts: { durationMin: number; mix: OaMix }, now = Date.now()): SessionRow {
  const picked = pickProblems(opts.mix, listDsa());
  if (picked.length < 2) throw new Error("At least two problems are needed for an online assessment.");
  const durationMs = opts.durationMin * 60_000;
  const state: OaState = { slugs: picked.map((p) => p.slug), durationMs, deadline: now + durationMs };
  return startSession({ mode: "oa", state, now });
}

export function parseState(session: SessionRow): OaState {
  return JSON.parse(session.stateJson) as OaState;
}

/** Ends the assessment if the clock ran out. Returns the up-to-date session. */
export function settleOa(session: SessionRow, now = Date.now()): SessionRow {
  if (session.status === "active" && now >= parseState(session).deadline) {
    endSession(session.id, "ended", parseState(session).deadline);
    return getSession(session.id)!;
  }
  return session;
}

export function getOa(id: string, now = Date.now()): { session: SessionRow; state: OaState; remainingMs: number; now: number } | null {
  const found = getSession(id);
  if (!found || found.mode !== "oa") return null;
  const session = settleOa(found, now);
  const state = parseState(session);
  return { session, state, remainingMs: session.status === "active" ? Math.max(0, state.deadline - now) : 0, now };
}

export interface OaProblemResult {
  slug: string;
  submissions: number;
  /** Best attempt: tests passed out of total (partial credit). */
  best: { passed: number; total: number; language: string; verdict: string } | null;
}

export function oaResults(session: SessionRow): { problems: OaProblemResult[]; score: number } {
  const state = parseState(session);
  const submits = sessionEvents<{ slug: string; passed: number; total: number; language: string; verdict: string }>(
    session.id,
    "submit",
  );
  const problems = state.slugs.map((slug): OaProblemResult => {
    const mine = submits.filter((e) => e.payload.slug === slug);
    let best: OaProblemResult["best"] = null;
    for (const { payload: p } of mine) {
      if (p.total > 0 && (!best || p.passed / p.total > best.passed / best.total)) {
        best = { passed: p.passed, total: p.total, language: p.language, verdict: p.verdict };
      }
    }
    return { slug, submissions: mine.length, best };
  });
  const score = problems.reduce((sum, p) => sum + (p.best ? p.best.passed / p.best.total : 0), 0) / problems.length;
  return { problems, score: Math.round(score * 100) };
}
