import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { sessions } from "../db/schema";
import type { SessionRow } from "../dsa/store";
import type { Phase } from "./phases";

export interface InterviewState {
  phases: Phase[];
  phaseIndex: number;
  phaseStartedAt: number;
  deadline: number;
  /** "packet": the conversation happens in another chat via the live packet; the app keeps time and code. */
  liveVia: "app" | "packet";
  /** Scripted lines already used, per phase. */
  scriptUsed: Record<string, number>;
  /** The candidate's code when the AI interviewer last spoke, for diffs. */
  llmCodeBaseline: string | null;
}

export function readState(session: SessionRow): InterviewState {
  return JSON.parse(session.stateJson) as InterviewState;
}

export function writeState(sessionId: string, state: InterviewState): void {
  getDb().update(sessions).set({ stateJson: JSON.stringify(state) }).where(eq(sessions.id, sessionId)).run();
}

export function setDriver(sessionId: string, driver: "scripted" | "llm"): void {
  getDb().update(sessions).set({ driver }).where(eq(sessions.id, sessionId)).run();
}
