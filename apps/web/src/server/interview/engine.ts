import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { drafts, events } from "../db/schema";
import { getDsa, getDsaPrivate } from "../content/repo";
import { ApiError } from "../http/errors";
import { addEvent, endSession, getSession, sessionEvents, startSession, type SessionRow } from "../dsa/store";
import { loadTemplate, render } from "../prompts/templates";
import { DSA_PHASES, totalMinutes } from "./phases";
import { readState, writeState, type InterviewState } from "./state";

/**
 * The round state machine (spec §7.1). Phases and the deadline live in the session row, and every read
 * settles them against the clock, so the interview survives refreshes and restarts. The scripted driver
 * (no AI) lives here too; the AI driver is in llm.ts.
 */

export type Speaker = "interviewer" | "candidate" | "system";

export interface ChatPayload {
  from: Speaker;
  text: string;
  phase: string;
  /** The AI's reply was blocked by the leak filter; `text` is the replacement. */
  filtered?: boolean;
  blockedReason?: string;
}

export interface ChatMessageView {
  id: string;
  ts: number;
  from: Speaker;
  text: string;
  filtered: boolean;
}

// ---- scripted lines -----------------------------------------------------------------------------------

const SCRIPT_PATH = "interviewer/dsa-scripted.md";

/** Lines per phase from prompts/interviewer/dsa-scripted.md ("## phase" headings, "- line" items). */
export function scriptedLines(minutes: number): { lines: Record<string, string[]>; versionTag: string } {
  const t = loadTemplate(SCRIPT_PATH);
  const lines: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of render(t.body, { minutes: String(minutes) }).split("\n")) {
    const heading = /^##\s+(\w+)/.exec(raw);
    if (heading) {
      current = heading[1]!;
      lines[current] = [];
    } else if (current && raw.startsWith("- ")) lines[current]!.push(raw.slice(2).trim());
  }
  return { lines, versionTag: t.versionTag };
}

/** Problem follow-ups lead the "test" phase; the generic testing questions come after. */
function linesFor(session: SessionRow, phaseId: string, state: InterviewState): string[] {
  const base = scriptedLines(totalMinutes(state.phases)).lines[phaseId] ?? [];
  if (phaseId !== "test" || !session.itemId) return base;
  const slug = session.itemId.split(":")[1]!;
  return [...(getDsaPrivate(slug)?.followups ?? []), ...base];
}

function say(session: SessionRow, state: InterviewState, from: Speaker, text: string, now: number, extra: Partial<ChatPayload> = {}) {
  addEvent(session.id, "chat", { from, text, phase: state.phases[state.phaseIndex]!.id, ...extra } satisfies ChatPayload, now);
}

/** The scripted interviewer's next line in the current phase, if it has one left. */
function scriptedNext(session: SessionRow, state: InterviewState, now: number): boolean {
  const phase = state.phases[state.phaseIndex]!;
  const lines = linesFor(session, phase.id, state);
  const used = state.scriptUsed[phase.id] ?? 0;
  if (used >= lines.length) return false;
  state.scriptUsed[phase.id] = used + 1;
  say(session, state, "interviewer", lines[used]!, now);
  return true;
}

/** Whether the app itself plays a scripted interviewer for this session. */
function scriptedHere(session: SessionRow, state: InterviewState): boolean {
  return session.driver === "scripted" && state.liveVia === "app";
}

// ---- lifecycle ----------------------------------------------------------------------------------------

export function startInterview(opts: { slug: string; driver: "scripted" | "llm"; liveVia: "app" | "packet"; now?: number }): SessionRow {
  const now = opts.now ?? Date.now();
  const problem = getDsa(opts.slug);
  if (!problem) throw new ApiError(404, "That problem doesn't exist.");
  const phases = DSA_PHASES;
  const state: InterviewState = {
    phases,
    phaseIndex: 0,
    phaseStartedAt: now,
    deadline: now + totalMinutes(phases) * 60_000,
    liveVia: opts.liveVia,
    scriptUsed: {},
    llmCodeBaseline: null,
  };
  const session = startSession({ itemId: problem.id, mode: "interview", driver: opts.driver, state, now });
  const fresh = getSession(session.id)!;
  addEvent(session.id, "phase_change", { to: phases[0]!.id, auto: false, reason: "start" }, now);
  if (opts.liveVia === "app") {
    // Both drivers open with the scripted greeting: instant, and the AI takes over from the first reply.
    scriptedNext(fresh, state, now);
  } else {
    say(fresh, state, "system", "The conversation happens in the other chat. Copy the live packet to start; this page keeps time and runs your code.", now);
  }
  writeState(session.id, state);
  return getSession(session.id)!;
}

function advanceTo(session: SessionRow, state: InterviewState, index: number, reason: string, at: number): void {
  const from = state.phases[state.phaseIndex]!;
  state.phaseIndex = index;
  state.phaseStartedAt = at;
  const to = state.phases[index]!;
  addEvent(session.id, "phase_change", { from: from.id, to: to.id, auto: reason === "time", reason }, at);
  say(session, state, "system", `${to.label} (${to.minutes} min).`, at);
  // One millisecond later so the line sorts after the phase notice (ULIDs aren't ordered within a millisecond).
  if (scriptedHere(session, state)) scriptedNext(session, state, at + 1);
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

/** Scripted driver: log the candidate's message and reply with the next line of the phase, if any. */
export function candidateSays(sessionId: string, text: string, now = Date.now()): void {
  const { session, state } = requireActive(sessionId, now);
  say(session, state, "candidate", text, now);
  if (scriptedHere(session, state)) scriptedNext(session, state, now + 1);
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
      return { id: e.id, ts: e.ts, from: p.from, text: p.text, filtered: Boolean(p.filtered) };
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
