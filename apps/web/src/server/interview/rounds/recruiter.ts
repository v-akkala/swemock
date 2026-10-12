import "server-only";
import { parseResume, probeFor } from "@swemock/shared";
import { getCsPrivate, getCsPublic, listCs, type CsListItem } from "../../content/questions";
import { addEvent, type SessionRow } from "../../dsa/store";
import { ApiError } from "../../http/errors";
import { say } from "../chat";
import { RECRUITER_PHASES } from "../phases";
import { createInterview } from "../session";
import type { Level, PoolEntry, RecruiterConfig, RecruiterRound } from "../state";
import { scriptSections } from "./script";
import type { Round, RoundCtx } from "./types";

const SCRIPT = "interviewer/recruiter-scripted.md";
const POOL_SIZE = 12;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

function script(config: RecruiterConfig) {
  return scriptSections(SCRIPT, {
    company: config.company || "the company",
    role: config.role || "software engineering",
    minutes: String(RECRUITER_PHASES.reduce((n, p) => n + p.minutes, 0)),
  }).lines;
}

// ---- question pool ----------------------------------------------------------------------------------

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Picks the questions for one screen: short-answer only, a spread of difficulties (4 easy, 5 medium,
 * 3 hard when the bank allows), and as many different topics as possible within each difficulty.
 */
export function buildPool(items: CsListItem[], rng: () => number, size = POOL_SIZE): PoolEntry[] {
  const quota = { easy: Math.round(size / 3), medium: Math.round(size * 0.42), hard: 0 };
  quota.hard = size - quota.easy - quota.medium;
  const picked: PoolEntry[] = [];
  const leftovers: PoolEntry[] = [];
  for (const d of DIFFICULTIES) {
    const seenTopics = new Map<string, number>();
    const ranked = shuffle(items.filter((i) => i.format === "short" && i.difficulty === d), rng)
      .map((i) => {
        const topic = i.topics[0]!;
        const rank = seenTopics.get(topic) ?? 0;
        seenTopics.set(topic, rank + 1);
        return { entry: { id: i.slug, difficulty: d } satisfies PoolEntry, rank };
      })
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.entry);
    picked.push(...ranked.slice(0, quota[d]));
    leftovers.push(...ranked.slice(quota[d]));
  }
  // A thin difficulty band shouldn't shrink the screen: top up from what's left.
  if (picked.length < size) picked.push(...leftovers.slice(0, size - picked.length));
  return picked;
}

/** The next question at the current level, or the nearest level that still has questions. */
export function nextInPool(round: Pick<RecruiterRound, "pool" | "asked" | "level">): PoolEntry | null {
  const remaining = round.pool.filter((p) => !round.asked.includes(p.id));
  if (remaining.length === 0) return null;
  const rank = (p: PoolEntry) => DIFFICULTIES.indexOf(p.difficulty);
  return [...remaining].sort((a, b) => Math.abs(rank(a) - round.level) - Math.abs(rank(b) - round.level) || rank(a) - rank(b))[0]!;
}

export function adapt(level: Level, grade: Level): Level {
  return Math.max(0, Math.min(2, level + (grade === 2 ? 1 : grade === 0 ? -1 : 0))) as Level;
}

// ---- scripted flow -----------------------------------------------------------------------------------

function roundState(ctx: RoundCtx): RecruiterRound {
  return ctx.state.round as RecruiterRound;
}

function askNext(ctx: RoundCtx, first: boolean): void {
  const r = roundState(ctx);
  const next = nextInPool(r);
  if (!next) {
    say(ctx.session, ctx.state, "interviewer", script(r.config).fundamentals_done![0]!, ctx.now);
    ctx.advance("wrapup", "script");
    return;
  }
  const q = getCsPublic(next.id);
  if (!q) throw new ApiError(500, `Question ${next.id} is no longer in the bank.`);
  r.asked.push(next.id);
  r.current = next.id;
  r.pending = null;
  const lead = first ? `${script(r.config).fundamentals_intro![0]!}\n\n` : "";
  say(ctx.session, ctx.state, "interviewer", `${lead}Question ${r.asked.length}: ${q.prompt.trim()}`, ctx.now, { ref: { kind: "cs", id: next.id, n: r.asked.length } });
}

function reveal(ctx: RoundCtx): void {
  const r = roundState(ctx);
  const id = r.current!;
  const priv = getCsPrivate(id);
  const points = priv ? priv.keyPoints.map((k) => `• ${k}`).join("\n") : "(This question is no longer in the bank.)";
  r.pending = id;
  r.current = null;
  say(ctx.session, ctx.state, "interviewer", `${script(r.config).reveal![0]!}\n${points}`, ctx.now, { ref: { kind: "cs-reveal", id } });
}

/** The candidate graded their own answer to the question whose key points are on screen. */
export function gradeFundamental(ctx: RoundCtx, questionId: string, grade: Level): void {
  const r = roundState(ctx);
  if (r.pending !== questionId) throw new ApiError(409, "That question isn't waiting for a grade.");
  const entry = r.pool.find((p) => p.id === questionId);
  r.grades[questionId] = grade;
  r.pending = null;
  r.level = adapt(r.level, grade);
  addEvent(ctx.session.id, "self_score", { kind: "cs_question", id: questionId, difficulty: entry?.difficulty ?? "medium", grade }, ctx.now);
  if (ctx.scripted) askNext({ ...ctx, now: ctx.now + 1 }, false);
}

export const recruiterRound: Round = {
  opening(ctx) {
    const r = roundState(ctx);
    const first = r.resumeLines[0]!;
    ctx.state.scriptUsed.resume = 1;
    say(ctx.session, ctx.state, "interviewer", first.text, ctx.now, first.ref ? { ref: first.ref } : {});
  },

  onPhaseStart(ctx, phaseId) {
    const r = roundState(ctx);
    const lines = script(r.config);
    if (phaseId === "fundamentals") {
      if (ctx.scripted) askNext(ctx, true);
      else say(ctx.session, ctx.state, "interviewer", lines.bridge_fundamentals![0]!, ctx.now);
    } else if (phaseId === "wrapup") {
      say(ctx.session, ctx.state, "interviewer", lines.wrapup![0]!, ctx.now);
    }
  },

  onCandidate(ctx) {
    const r = roundState(ctx);
    const phase = ctx.state.phases[ctx.state.phaseIndex]!.id;
    const lines = script(r.config);
    if (phase === "resume") {
      const used = ctx.state.scriptUsed.resume ?? 0;
      if (used < r.resumeLines.length) {
        const line = r.resumeLines[used]!;
        ctx.state.scriptUsed.resume = used + 1;
        say(ctx.session, ctx.state, "interviewer", line.text, ctx.now, line.ref ? { ref: line.ref } : {});
      } else {
        say(ctx.session, ctx.state, "interviewer", lines.resume_done![0]!, ctx.now);
        ctx.advance("fundamentals", "script");
      }
    } else if (phase === "fundamentals") {
      if (r.pending) say(ctx.session, ctx.state, "interviewer", lines.grade_first![0]!, ctx.now);
      else if (r.current) reveal(ctx);
      else askNext(ctx, false);
    } else {
      const used = ctx.state.scriptUsed.wrapup_reply ?? 0;
      const replies = lines.wrapup_reply!;
      ctx.state.scriptUsed.wrapup_reply = used + 1;
      say(ctx.session, ctx.state, "interviewer", replies[Math.min(used, replies.length - 1)]!, ctx.now);
    }
  },
};

// ---- starting a screen -------------------------------------------------------------------------------

export interface StartRecruiterOptions {
  resumeText: string;
  resumeTitle?: string;
  role: string;
  company?: string;
  jobDescription?: string;
  driver: "scripted" | "llm";
  liveVia: "app" | "packet";
  now?: number;
  rng?: () => number;
}

export function startRecruiter(opts: StartRecruiterOptions): SessionRow {
  const now = opts.now ?? Date.now();
  const resumeText = opts.resumeText.trim();
  if (resumeText.length < 40) throw new ApiError(400, "Add your resume first: paste the text or upload a PDF.");
  const config: RecruiterConfig = {
    resumeTitle: opts.resumeTitle?.trim() || "Resume",
    resumeText,
    jobDescription: (opts.jobDescription ?? "").trim(),
    role: opts.role.trim().slice(0, 80),
    company: (opts.company ?? "").trim().slice(0, 80),
  };
  const lines = script(config);
  const parsed = parseResume(resumeText);
  const resumeLines: RecruiterRound["resumeLines"] = [{ text: lines.greeting![0]! }];
  for (const b of parsed.probes) resumeLines.push({ text: probeFor(b), ref: { kind: "probe" } });
  if (parsed.probes.length === 0) resumeLines.push({ text: lines.no_probes![0]! });
  if (config.jobDescription) resumeLines.push({ text: lines.job_description![0]! });
  resumeLines.push({ text: (config.company ? lines.why_company : lines.why_generic)![0]! });
  resumeLines.push(...lines.logistics!.map((text) => ({ text })));

  const round: RecruiterRound = {
    kind: "recruiter",
    config,
    resumeLines,
    probeBullets: parsed.probes.map((b) => ({ text: b.text, flags: b.flags })),
    pool: buildPool(listCs(), opts.rng ?? Math.random),
    asked: [],
    current: null,
    pending: null,
    level: 0,
    grades: {},
  };
  return createInterview({
    roundType: "recruiter",
    phases: RECRUITER_PHASES,
    driver: opts.driver,
    liveVia: opts.liveVia,
    round,
    now,
    packetNotice: "The conversation happens in the other chat. Copy the live packet to start; this page keeps time.",
    opening: (session, state) => recruiterRound.opening({ session, state, now, scripted: opts.driver === "scripted", advance: () => undefined }),
  });
}
