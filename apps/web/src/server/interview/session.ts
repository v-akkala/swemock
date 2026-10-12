import "server-only";
import { addEvent, getSession, startSession, type SessionRow } from "../dsa/store";
import { say } from "./chat";
import type { Phase } from "./phases";
import { totalMinutes } from "./phases";
import { writeState, type InterviewState } from "./state";

/**
 * Creates an interview session: the round's phases and clock, the state row, and the first phase event.
 * `opening` runs after the row exists so the round can write its first line(s) and adjust `state`.
 */
export function createInterview(opts: {
  roundType: string;
  itemId?: string | null;
  phases: Phase[];
  driver: "scripted" | "llm";
  liveVia: "app" | "packet";
  round?: InterviewState["round"];
  /** Shown when the conversation happens in another chat. */
  packetNotice?: string;
  now: number;
  opening: (session: SessionRow, state: InterviewState) => void;
}): SessionRow {
  const { now, phases } = opts;
  const state: InterviewState = {
    phases,
    phaseIndex: 0,
    phaseStartedAt: now,
    deadline: now + totalMinutes(phases) * 60_000,
    liveVia: opts.liveVia,
    scriptUsed: {},
    llmCodeBaseline: null,
    ...(opts.round ? { round: opts.round } : {}),
  };
  const session = startSession({ itemId: opts.itemId ?? null, roundType: opts.roundType, mode: "interview", driver: opts.driver, state, now });
  const fresh = getSession(session.id)!;
  addEvent(session.id, "phase_change", { to: phases[0]!.id, auto: false, reason: "start" }, now);
  if (opts.liveVia === "app") opts.opening(fresh, state);
  else {
    const notice = opts.packetNotice ?? "The conversation happens in the other chat. Copy the live packet to start; this page keeps time and runs your code.";
    say(fresh, state, "system", notice, now);
  }
  writeState(session.id, state);
  return getSession(session.id)!;
}
