import "server-only";
import { addEvent, type SessionRow } from "../dsa/store";
import type { InterviewState } from "./state";

export type Speaker = "interviewer" | "candidate" | "system";

/** What the browser reports about how an answer was given. */
export interface AnswerMeta {
  voice?: boolean;
  /** Milliseconds of actual speech (recognition running), for words per minute. */
  speechMs?: number;
}

/** Marks interviewer lines that come from the content bank, so the debrief can group answers by question. */
export interface ChatRef {
  kind: "cs" | "cs-reveal" | "behavioral" | "followup" | "probe";
  id?: string;
  /** 1-based question number, where it applies. */
  n?: number;
}

export interface ChatPayload {
  from: Speaker;
  text: string;
  phase: string;
  /** The AI's reply was blocked by the leak filter; `text` is the replacement. */
  filtered?: boolean;
  blockedReason?: string;
  meta?: AnswerMeta;
  ref?: ChatRef;
}

export function say(session: SessionRow, state: InterviewState, from: Speaker, text: string, now: number, extra: Partial<ChatPayload> = {}): void {
  addEvent(session.id, "chat", { from, text, phase: state.phases[state.phaseIndex]!.id, ...extra } satisfies ChatPayload, now);
}
