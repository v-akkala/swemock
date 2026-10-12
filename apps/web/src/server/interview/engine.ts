import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { drafts, events } from "../db/schema";
import { getDsa } from "../content/repo";
import { ApiError } from "../http/errors";
import { addEvent, endSession, getSession, sessionEvents, type SessionRow } from "../dsa/store";
import { say, type AnswerMeta, type ChatPayload, type Speaker } from "./chat";
import { DSA_PHASES } from "./phases";
import { dsaRound } from "./rounds/dsa";
import { roundFor, type RoundCtx } from "./rounds";
import { gradeFundamental } from "./rounds/recruiter";
import { createInterview } from "./session";
import { readState, writeState, type InterviewState } from "./state";

/**
 * The round state machine (spec §7.1). Phases and the deadline live in the session row, and every read
 * settles them against the clock, so the interview survives refreshes and restarts. The scripted driver
 * (no AI) lives here too; the AI driver is in llm.ts.
 */

export type { ChatPayload, Speaker } from "./chat";
export { scriptedLines } from "./rounds/dsa";

export interface ChatMessageView {
  id: string;
  ts: number;
  from: Speaker;
  text: string;
  filtered: boolean;
  /** Set on lines that come from the content bank (question, follow-up, key-point reveal). */
  tag: string | null;
}

// ---- lifecycle ----------------------------------------------------------------------------------------

/** Whether the app itself plays the interviewer for this session (no AI, not an external chat). */
function scriptedHere(session: SessionRow, state: InterviewState): boolean {
  return session.driver === "scripted" && state.liveVia === "app";
}

/** What a round adapter gets: the clock-aware context, with a way to move phases from inside the script. */
export function roundCtx(session: SessionRow, state: InterviewState, now: number): RoundCtx {
  return {
    session,
    state,
    now,
    scripted: session.driver === "scripted",
    advance: (toPhaseId, reason) => {
      const index = state.phases.findIndex((p) => p.id === toPhaseId);
      if (index > state.phaseIndex) advanceTo(session, state, index, reason, now);
    },
  };
}

export function startInterview(opts: { slug: string; driver: "scripted" | "llm"; liveVia: "app" | "packet"; now?: number }): SessionRow {
  const now = opts.now ?? Date.now();
  const problem = getDsa(opts.slug);
  if (!problem) throw new ApiError(404, "That problem doesn't exist.");
  return createInterview({
    roundType: "dsa",
    itemId: problem.id,
    phases: DSA_PHASES,
    driver: opts.driver,
    liveVia: opts.liveVia,
    now,
    opening: (session, state) => dsaRound.opening(roundCtx(session, state, now)),
  });
}

function advanceTo(session: SessionRow, state: InterviewState, index: number, reason: string, at: number): void {
  const from = state.phases[state.phaseIndex]!;
  state.phaseIndex = index;
  state.phaseStartedAt = at;
  const to = state.phases[index]!;
  addEvent(session.id, "phase_change", { from: from.id, to: to.id, auto: reason === "time", reason }, at);
  say(session, state, "system", `${to.label} (${to.minutes} min).`, at);
  // One millisecond later so the line sorts after the phase notice (ULIDs aren't ordered within a millisecond).
  if (state.liveVia === "app") roundFor(session).onPhaseStart(roundCtx(session, state, at + 1), to.id);
}

/**
 * Brings the session up to date with the clock: moves through phases whose time ran out and ends the
 * round at the deadline. Returns the fresh session and state.
 */
export function settleInterview(sessionId: string, now = Date.now()): { session: SessionRow; state: InterviewState } {
  let session = getSession(sessionId);
  if (!session || session.mode !== "interview") throw new ApiError(404, "Unknown interview.");
  const state = readState(session);
  if (session.status !== "active") return { session, state };
  let changed = false;
  while (state.phaseIndex < state.phases.length - 1) {
    const end = state.phaseStartedAt + state.phases[state.phaseIndex]!.minutes * 60_000;
    if (now < end) break;
    advanceTo(session, state, state.phaseIndex + 1, "time", end);
    changed = true;
  }
  if (now >= state.deadline) {
    say(session, state, "system", "Time is up. The interview has ended.", state.deadline);
    addEvent(session.id, "phase_change", { from: state.phases[state.phaseIndex]!.id, to: "ended", auto: true, reason: "time" }, state.deadline);
    endSession(session.id, "ended", state.deadline);
    changed = true;
  }
  if (changed) writeState(session.id, state);
  session = getSession(sessionId)!;
  return { session, state };
}

export function requireActive(sessionId: string, now = Date.now()): { session: SessionRow; state: InterviewState } {
  const r = settleInterview(sessionId, now);
  if (r.session.status !== "active") throw new ApiError(409, "This interview has ended.");
  return r;
}

/** The candidate clicked "Move on". */
export function advancePhase(sessionId: string, now = Date.now()): void {
  const { session, state } = requireActive(sessionId, now);
  if (state.phaseIndex >= state.phases.length - 1) throw new ApiError(409, "This is the last phase. End the interview when you're done.");
  advanceTo(session, state, state.phaseIndex + 1, "candidate", now);
  writeState(session.id, state);
}

export function endInterview(sessionId: string, now = Date.now()): void {
  const { session, state } = settleInterview(sessionId, now);
  if (session.status !== "active") return;
  addEvent(session.id, "phase_change", { from: state.phases[state.phaseIndex]!.id, to: "ended", auto: false, reason: "candidate" }, now);
  endSession(session.id, "ended", now);
}

/** A working solution moves a coding interview on to testing, where the follow-ups come in. */
export function onAccepted(sessionId: string, now = Date.now()): void {
  const { session, state } = settleInterview(sessionId, now);
  if (session.status !== "active") return;
  const test = state.phases.findIndex((p) => p.id === "test");
  if (test > state.phaseIndex) {
    advanceTo(session, state, test, "accepted", now);
    writeState(session.id, state);
  }
}

/** Scripted driver: log the candidate's message and reply with the round's next scripted line, if any. */
export function candidateSays(sessionId: string, text: string, now = Date.now(), meta: AnswerMeta = {}): void {
  const { session, state } = requireActive(sessionId, now);
  say(session, state, "candidate", text, now, Object.keys(meta).length ? { meta } : {});
  if (scriptedHere(session, state)) roundFor(session).onCandidate(roundCtx(session, state, now + 1), text, meta);
  writeState(session.id, state);
}

/** Recruiter screen: the candidate graded their own answer to the question on screen. */
export function gradeFundamentalsQuestion(sessionId: string, questionId: string, grade: 0 | 1 | 2, now = Date.now()): void {
  const { session, state } = requireActive(sessionId, now);
  if (state.round?.kind !== "recruiter") throw new ApiError(400, "This interview has no fundamentals questions.");
  gradeFundamental(roundCtx(session, state, now), questionId, grade);
  writeState(session.id, state);
}

// ---- reading ----------------------------------------------------------------------------------------

export function chatMessages(sessionId: string, afterTs = 0): ChatMessageView[] {
  return getDb()
    .select()
    .from(events)
    .where(and(eq(events.sessionId, sessionId), eq(events.kind, "chat"), gt(events.ts, afterTs)))
    .orderBy(events.ts, events.id)
    .all()
    .map((e) => {
      const p = JSON.parse(e.payloadJson) as ChatPayload;
      return { id: e.id, ts: e.ts, from: p.from, text: p.text, filtered: Boolean(p.filtered), tag: p.ref?.kind ?? null };
    });
}

/** The candidate's most recently saved code in this session (any language). */
export function latestCode(session: SessionRow): { language: string; code: string } | null {
  if (!session.itemId) return null;
  const row = getDb()
    .select()
    .from(drafts)
    .where(and(eq(drafts.itemId, session.itemId), eq(drafts.sessionId, session.id)))
    .orderBy(desc(drafts.updatedAt))
    .limit(1)
    .get();
  if (!row?.language) return null;
  return { language: row.language, code: (JSON.parse(row.filesJson) as { code: string }).code };
}

export function latestJudgeResult(sessionId: string): string | null {
  const last = [...sessionEvents<{ verdict: string; passed: number; total: number; language: string }>(sessionId)]
    .filter((e) => e.kind === "run" || e.kind === "submit")
    .at(-1);
  if (!last) return null;
  const p = last.payload;
  return `${last.kind === "run" ? "Ran the samples" : "Submitted"} in ${p.language}: ${p.verdict.replace(/_/g, " ")}, ${p.passed}/${p.total} passed`;
}
