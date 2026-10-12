// Types shared by DSA API routes and client components. No server imports here.
import type { DsaRunResult, Language, Verdict } from "@swemock/shared";

export type ProblemStatus = "unsolved" | "attempted" | "solved";

export interface MaskedTestResult {
  id: string;
  /** "Sample 1", "Custom input", or "Hidden test #3". */
  label: string;
  hidden: boolean;
  /** Category of a hidden test (edge, random, stress). */
  kind: string | null;
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  /** Present for visible and custom tests only; hidden tests never carry these. */
  input?: unknown;
  expected?: unknown;
  actual?: string | null;
  stdout?: string;
  stderr?: string;
  message?: string | null;
}

export type Efficiency = "comparable" | "slower" | "much-slower";

export interface RunResponse {
  sessionId: string;
  kind: "run" | "submit";
  verdict: Verdict;
  passed: number;
  total: number;
  compileOutput: string | null;
  tests: MaskedTestResult[];
  maxTimeMs: number | null;
  maxMemoryKb: number | null;
  /** Only on an accepted submit. */
  efficiency?: { rating: Efficiency; userMs: number; referenceMs: number } | null;
  /** The problem was solved by this submit. */
  solved?: boolean;
}

export interface EditorialPayload {
  editorialMd: string;
  references: Partial<Record<Language, string>>;
}

export interface HintPayload {
  sessionId: string;
  level: number;
  text: string;
}

export type { DsaRunResult };
