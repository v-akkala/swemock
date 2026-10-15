// Types shared by AI Fluency API routes and client components. No server imports here.
import type { Hunk, Severity } from "@swemock/shared";

export type FluencyType = "comprehension" | "review" | "extension";
export const FLUENCY_TYPES: FluencyType[] = ["comprehension", "review", "extension"];

export interface FindingView {
  id: string;
  file: string;
  lines: [number, number];
  category: string;
  severity: Severity;
  text: string;
}

export interface FluencyTestView {
  /** The test's name for visible tests; "Hidden test #3" for hidden ones. */
  label: string;
  hidden: boolean;
  category: string;
  status: "passed" | "failed" | "error" | "skipped";
  message?: string | null;
}

export interface CommandResult {
  sessionId: string;
  commandId: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  tests: FluencyTestView[] | null;
  passed: number;
  total: number;
}

export interface SubmitResult {
  sessionId: string;
  tests: FluencyTestView[];
  counts: Record<string, { passed: number; total: number }>;
  passed: number;
  total: number;
  buildError: string | null;
  timedOut: boolean;
  /** Every test (visible and hidden) passed. */
  solved: boolean;
}

export interface Proposal {
  id: string;
  path: string;
  /** The file when the reply arrived, and the file the assistant proposed. */
  base: string;
  newContent: string;
}

export interface AssistantTurn {
  promptId: string;
  /** Set when a model answered; with provider none the user takes `packet` to a chatbot instead. */
  reply: string | null;
  packet: string | null;
  proposals: Proposal[];
}

export type { Hunk };
