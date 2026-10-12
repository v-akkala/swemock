import "server-only";
import { answerSignals, COMPETENCY_IDS, type LensId } from "@swemock/shared";
import { getBehavioralPrivate, getBehavioralPublic, listBehavioral, type BehavioralListItem } from "../../content/questions";
import type { SessionRow } from "../../dsa/store";
import { ApiError } from "../../http/errors";
import { say } from "../chat";
import { behavioralPhases } from "../phases";
import { createInterview } from "../session";
import type { BehavioralRound } from "../state";
import { scriptSections } from "./script";
import type { Round, RoundCtx } from "./types";

const SCRIPT = "interviewer/behavioral-scripted.md";
export const MIN_QUESTIONS = 4;
export const MAX_QUESTIONS = 6;
/** Spec §8.5: 1–3 probing follow-ups per question; the scripted interviewer asks up to two. */
const MAX_FOLLOWUPS = 2;

const lines = (vars: Record<string, string> = {}) => scriptSections(SCRIPT, { count: "5", minutes: "35", ...vars }).lines;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Chooses the questions for one mock: questions matching the requested competencies or company lens come
 * first, and no competency repeats until every one on offer has been used once.
 */
export function selectQuestions(
  bank: BehavioralListItem[],
  opts: { count: number; lens: LensId | null; focus: string[] },
  rng: () => number,
): string[] {
  const score = (q: BehavioralListItem) =>
    (opts.focus.length && q.competencies.some((c) => opts.focus.includes(c)) ? 2 : 0) + (opts.lens && q.lenses.some((l) => l.startsWith(`${opts.lens}:`)) ? 1 : 0);
  const pool = shuffle(bank, rng).sort((a, b) => score(b) - score(a));
  const chosen: BehavioralListItem[] = [];
  const used = new Set<string>();
  while (chosen.length < opts.count && pool.length) {
    const i = pool.findIndex((q) => !used.has(q.competencies[0]!));
    const [q] = pool.splice(i >= 0 ? i : 0, 1);
    chosen.push(q!);
    used.add(q!.competencies[0]!);
    if (used.size >= COMPETENCY_IDS.length) used.clear();
  }
  return chosen.map((q) => q.slug);
}

function roundState(ctx: RoundCtx): BehavioralRound {
  return ctx.state.round as BehavioralRound;
}

function askQuestion(ctx: RoundCtx, index: number): void {
  const r = roundState(ctx);
  const slug = r.config.questionIds[index]!;
  const q = getBehavioralPublic(slug);
  if (!q) throw new ApiError(500, `Question ${slug} is no longer in the bank.`);
  r.qIndex = index;
  r.followups = 0;
  r.usedProbes = [];
  say(ctx.session, ctx.state, "interviewer", `Question ${index + 1} of ${r.config.questionIds.length}: ${q.prompt.trim()}`, ctx.now, {
    ref: { kind: "behavioral", id: slug, n: index + 1 },
  });
}

/** The probe a good interviewer would ask next, given what the answer left out. */
function pickProbe(ctx: RoundCtx, text: string): { text: string; key: string } | null {
  const r = roundState(ctx);
  const l = lines();
  const s = answerSignals(text);
  const authored = getBehavioralPrivate(r.config.questionIds[r.qIndex]!)?.followUps ?? [];
  if ((s.iShare === null || s.iShare < 0.4) && !r.usedProbes.includes("own")) return { key: "own", text: l.probe_own![0]! };
  if (!s.hasNumber && !r.usedProbes.includes("result")) return { key: "result", text: l.probe_result![0]! };
  const i = authored.findIndex((_, n) => !r.usedProbes.includes(`f${n}`));
  if (i >= 0) return { key: `f${i}`, text: authored[i]! };
  return null;
}

export const behavioralRound: Round = {
  opening(ctx) {
    const r = roundState(ctx);
    say(ctx.session, ctx.state, "interviewer", lines({ count: String(r.config.questionIds.length) }).greeting![0]!, ctx.now);
  },

  onPhaseStart(ctx, phaseId) {
    if (phaseId === "questions" && ctx.scripted) askQuestion(ctx, 0);
    else if (phaseId === "wrapup") say(ctx.session, ctx.state, "interviewer", lines().wrapup![0]!, ctx.now);
  },

  onCandidate(ctx, text) {
    const r = roundState(ctx);
    const phase = ctx.state.phases[ctx.state.phaseIndex]!.id;
    if (phase === "intro") {
      ctx.advance("questions", "script");
    } else if (phase === "questions") {
      const probe = r.followups < MAX_FOLLOWUPS ? pickProbe(ctx, text) : null;
      if (probe) {
        r.followups++;
        r.usedProbes.push(probe.key);
        say(ctx.session, ctx.state, "interviewer", probe.text, ctx.now, { ref: { kind: "followup", id: r.config.questionIds[r.qIndex], n: r.qIndex + 1 } });
      } else if (r.qIndex + 1 < r.config.questionIds.length) {
        askQuestion(ctx, r.qIndex + 1);
      } else {
        say(ctx.session, ctx.state, "interviewer", lines().closing![0]!, ctx.now);
        ctx.advance("wrapup", "script");
      }
    } else {
      const used = ctx.state.scriptUsed.wrapup_reply ?? 0;
      const replies = lines().wrapup_reply!;
      ctx.state.scriptUsed.wrapup_reply = used + 1;
      say(ctx.session, ctx.state, "interviewer", replies[Math.min(used, replies.length - 1)]!, ctx.now);
    }
  },

  /** With the AI interviewer, the first reply from the candidate opens the question phase. */
  beforeLlmTurn(ctx) {
    if (ctx.state.phases[ctx.state.phaseIndex]!.id === "intro") ctx.advance("questions", "script");
  },
};

export interface StartBehavioralOptions {
  count?: number;
  lens?: LensId | null;
  focus?: string[];
  /** Exactly these questions, in order (redo). */
  questionIds?: string[];
  driver: "scripted" | "llm";
  liveVia: "app" | "packet";
  now?: number;
  rng?: () => number;
}

export function startBehavioral(opts: StartBehavioralOptions): SessionRow {
  const now = opts.now ?? Date.now();
  const bank = listBehavioral();
  const count = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, opts.count ?? 5));
  const questionIds = opts.questionIds ?? selectQuestions(bank, { count, lens: opts.lens ?? null, focus: opts.focus ?? [] }, opts.rng ?? Math.random);
  if (questionIds.length < MIN_QUESTIONS && !opts.questionIds) throw new ApiError(409, "The behavioral question bank has too few questions.");
  const round: BehavioralRound = { kind: "behavioral", config: { questionIds, lens: opts.lens ?? null }, qIndex: -1, followups: 0, usedProbes: [] };
  return createInterview({
    roundType: "behavioral",
    phases: behavioralPhases(questionIds.length),
    driver: opts.driver,
    liveVia: opts.liveVia,
    round,
    now,
    packetNotice: "The conversation happens in the other chat. Copy the live packet to start; this page keeps time.",
    opening: (session, state) => behavioralRound.opening({ session, state, now, scripted: opts.driver === "scripted", advance: () => undefined }),
  });
}
