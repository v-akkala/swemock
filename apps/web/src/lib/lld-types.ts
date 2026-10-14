// Types shared by LLD API routes and client components. No server imports here.
import type { LldCategory } from "@swemock/shared";

export type LldTestStatus = "passed" | "failed" | "error" | "skipped";

export interface MaskedLldTest {
  /** The test's name for visible tests; "Hidden test #3" for hidden ones. */
  label: string;
  hidden: boolean;
  category: LldCategory;
  status: LldTestStatus;
  /** Visible tests only: the assertion message or traceback. */
  message?: string | null;
}

export type CategoryCounts = Record<LldCategory, { passed: number; total: number }>;

export interface LldRunResponse {
  sessionId: string;
  kind: "run" | "submit";
  /** Tests didn't run: the code (or a test) didn't compile or import. */
  buildError: string | null;
  timedOut: boolean;
  tests: MaskedLldTest[];
  counts: CategoryCounts;
  passed: number;
  total: number;
  /** Extension tests are part of this result (the requirement change was introduced). */
  extensionIncluded: boolean;
  /** Every core and edge test passed. */
  solved: boolean;
  /** Edits to provided files, by path (only paths that changed). */
  edits: Record<string, { added: number; removed: number }>;
  durationMs: number;
}

export interface LldFileRunResponse {
  sessionId: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export interface LldRevealPayload {
  designMd: string;
  diagram: string;
  /** language → path → content */
  references: Record<string, Record<string, string>>;
}
