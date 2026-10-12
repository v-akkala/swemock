import type { SessionRow } from "../../dsa/store";
import type { AnswerMeta } from "../chat";
import type { InterviewState } from "../state";

/** What a round adapter gets to work with. `state` is mutated in place and saved by the engine afterwards. */
export interface RoundCtx {
  session: SessionRow;
  state: InterviewState;
  now: number;
  /** The app itself plays the interviewer (no AI). */
  scripted: boolean;
  /** Move to another phase on the script's say-so (logged as a phase change with this reason). */
  advance(toPhaseId: string, reason: string): void;
}

/**
 * Everything that differs between round types. The engine owns the clock, phases, and logging; a round
 * owns what the interviewer says and when (spec §7.1–7.2).
 */
export interface Round {
  /** The first line(s) of the round, always scripted so the page isn't empty while the AI warms up. */
  opening(ctx: RoundCtx): void;
  /** A phase began and the app is the interviewer's voice (scripted) or bridges to the AI. */
  onPhaseStart(ctx: RoundCtx, phaseId: string): void;
  /** Scripted driver: the candidate said something. */
  onCandidate(ctx: RoundCtx, text: string, meta: AnswerMeta): void;
  /** AI driver: runs after the candidate's message is logged and before the model is called. */
  beforeLlmTurn?(ctx: RoundCtx): void;
}
