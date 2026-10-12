import "server-only";
import { eq } from "drizzle-orm";
import type { LensId } from "@swemock/shared";
import { getDb } from "../db";
import { sessions } from "../db/schema";
import type { SessionRow } from "../dsa/store";
import type { Phase } from "./phases";

export type Level = 0 | 1 | 2;

export interface RecruiterConfig {
  resumeTitle: string;
  resumeText: string;
  jobDescription: string;
  role: string;
  company: string;
}

export interface PoolEntry {
  id: string;
  difficulty: "easy" | "medium" | "hard";
}

/** Recruiter screen: the resume lines the scripted recruiter uses, and the fundamentals question flow. */
export interface RecruiterRound {
  kind: "recruiter";
  config: RecruiterConfig;
  /** Greeting, resume deep dives, motivation, logistics: in the order they are asked. */
  resumeLines: { text: string; ref?: { kind: "probe" } }[];
  /** The bullets the deep dives are about (for the resume feedback panel). */
  probeBullets: { text: string; flags: string[] }[];
  pool: PoolEntry[];
  asked: string[];
  /** Asked, waiting for the candidate's answer. */
  current: string | null;
  /** Answered, waiting for the candidate to grade themselves. */
  pending: string | null;
  level: Level;
  grades: Record<string, Level>;
}

export interface BehavioralConfig {
  questionIds: string[];
  lens: LensId | null;
}

export interface BehavioralRound {
  kind: "behavioral";
  config: BehavioralConfig;
  qIndex: number;
  followups: number;
  usedProbes: string[];
}

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
  /** Round-specific state; absent for coding rounds. */
  round?: RecruiterRound | BehavioralRound;
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
