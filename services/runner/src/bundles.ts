import { type Language, type Signature, type dsaRunRequestSchema, type projectRunRequestSchema } from "@swemock/shared";
import type { z } from "zod";
import { PROFILES, shellQuote } from "./languages";

type DsaRequest = z.output<typeof dsaRunRequestSchema>;
type ProjectRequest = z.output<typeof projectRunRequestSchema>;

/** Slack on top of the per-test limit for parsing input and serializing output. */
export const WALL_SLACK_MS = 1000;
export const STARTUP_TIMEOUT_MS = 10_000;
/** Total time for running tests; tests not reached are reported as skipped. */
export const MAX_TEST_BUDGET_MS = 90_000;

export interface Bundle {
  /** Sent to the container's agent on stdin. */
  payload: Record<string, unknown>;
  language: Language;
  memoryLimitMb: number;
  /** Hard kill deadline for the whole container. */
  deadlineMs: number;
}

export function buildDsaBundle(req: DsaRequest): Bundle {
  const profile = PROFILES[req.language];
  const { files, compile, run } = profile.dsa(req.code, req.signature as Signature, req.memoryLimitMb);
  const budgetMs = Math.min(MAX_TEST_BUDGET_MS, req.tests.length * (req.timeLimitMs + WALL_SLACK_MS) + STARTUP_TIMEOUT_MS);
  return {
    language: req.language,
    memoryLimitMb: req.memoryLimitMb,
    deadlineMs: (compile?.timeoutMs ?? 0) + STARTUP_TIMEOUT_MS + budgetMs + 15_000,
    payload: {
      mode: "dsa",
      files,
      compile,
      run,
      tests: req.tests,
      checker: req.checker,
      timeLimitMs: req.timeLimitMs,
      wallSlackMs: WALL_SLACK_MS,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      memoryLimitMb: req.memoryLimitMb,
      memoryAllowanceKb: profile.memoryAllowanceKb,
      stopOnFirstFailure: req.stopOnFirstFailure,
      captureFull: req.captureFull,
      budgetMs,
    },
  };
}

export function buildProjectBundle(req: ProjectRequest): Bundle {
  const command =
    req.command.kind === "shell" ? req.command.cmd : PROFILES[req.language].runFile(shellQuote(req.command.path));
  return {
    language: req.language,
    memoryLimitMb: req.memoryLimitMb,
    deadlineMs: req.timeoutMs + 15_000,
    payload: {
      mode: "project",
      files: req.files,
      command,
      timeoutMs: req.timeoutMs,
      stdin: req.stdin,
      results: req.results,
      collect: req.collect,
    },
  };
}

export function bundleSize(b: Bundle): number {
  return Buffer.byteLength(JSON.stringify(b.payload));
}
