import type { DsaRunResult } from "@swemock/shared";
import type { Efficiency, MaskedTestResult } from "@/lib/dsa-types";

/** What the server knows about each test it sent to the judge. */
export interface CaseInfo {
  id: string;
  /** Visible samples and the user's custom input are shown in full; hidden tests are not. */
  hidden: boolean;
  label: string;
  kind: string | null;
  input?: unknown;
  expected?: unknown;
}

/**
 * Turns the judge's raw per-test results into what the browser may see.
 *
 * Hidden tests (spec §5.4): only "hidden test #k failed" and the test's category. No input, expected
 * or actual output, no stdout/stderr (a program can print its input), no error text.
 */
export function maskTests(result: DsaRunResult, cases: Map<string, CaseInfo>): MaskedTestResult[] {
  const out: MaskedTestResult[] = [];
  for (const t of result.tests) {
    const info = cases.get(t.id);
    if (!info) continue; // never forward results for tests we didn't send
    if (info.hidden) {
      out.push({
        id: t.id,
        label: info.label,
        hidden: true,
        kind: info.kind,
        verdict: t.verdict,
        timeMs: t.timeMs,
        memoryKb: t.memoryKb,
      });
    } else {
      out.push({
        id: t.id,
        label: info.label,
        hidden: false,
        kind: null,
        verdict: t.verdict,
        timeMs: t.timeMs,
        memoryKb: t.memoryKb,
        input: info.input,
        expected: info.expected,
        actual: t.actual,
        stdout: t.stdout,
        stderr: t.stderr,
        message: t.message,
      });
    }
  }
  return out;
}

/** Timings under this are noise (process scheduling, clock resolution). */
const NOISE_FLOOR_MS = 5;

/** Rough rating of the slowest test against the reference solution's slowest test, same language. */
export function rateEfficiency(userMs: number, referenceMs: number): Efficiency {
  const ratio = Math.max(userMs, NOISE_FLOOR_MS) / Math.max(referenceMs, NOISE_FLOOR_MS);
  if (ratio <= 3) return "comparable";
  if (ratio <= 10) return "slower";
  return "much-slower";
}
