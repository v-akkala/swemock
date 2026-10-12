"use client";

import { useState } from "react";
import { VERDICT_LABELS, type Verdict } from "@swemock/shared";
import type { Efficiency, MaskedTestResult, RunResponse } from "@/lib/dsa-types";
import { cn } from "@/lib/utils";

export function verdictColor(v: Verdict): string {
  if (v === "accepted") return "text-emerald-600 dark:text-emerald-400";
  if (v === "ran" || v === "skipped") return "text-muted-foreground";
  return "text-red-600 dark:text-red-400";
}

const EFFICIENCY_TEXT: Record<Efficiency, string> = {
  comparable: "Comparable to the reference solution",
  slower: "Slower than the reference solution",
  "much-slower": "Much slower than the reference solution",
};

function pretty(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function Block({ title, children, tone }: { title: string; children: string; tone?: "error" }) {
  return (
    <div>
      <p className="text-muted-foreground mb-0.5 text-xs">{title}</p>
      <pre
        className={cn(
          "bg-muted max-h-48 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap break-all",
          tone === "error" && "text-red-600 dark:text-red-400",
        )}
      >
        {children || "(empty)"}
      </pre>
    </div>
  );
}

function TestDetail({ test }: { test: MaskedTestResult }) {
  if (test.hidden) {
    const failed = test.verdict !== "accepted";
    return (
      <p className="text-sm" data-testid="hidden-failure">
        {failed ? (
          <>
            <strong>{test.label}</strong> failed{test.kind ? ` (${test.kind} case)` : ""}. Details of hidden tests aren&apos;t shown.
          </>
        ) : (
          <>{test.label} passed.</>
        )}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {test.input !== undefined && <Block title="Input">{pretty(test.input)}</Block>}
      {test.expected !== undefined && <Block title="Expected">{pretty(test.expected)}</Block>}
      {test.actual != null && <Block title="Output">{test.actual}</Block>}
      {test.message && <Block title="Details" tone="error">{test.message}</Block>}
      {test.stdout && <Block title="Your stdout">{test.stdout}</Block>}
      {test.stderr && <Block title="Your stderr" tone="error">{test.stderr}</Block>}
    </div>
  );
}


export function VerdictPanel({ result }: { result: RunResponse }) {
  // Hidden tests that passed (or weren't reached) are summarized; only failures get their own chip.
  const chips = result.tests.filter((t) => !t.hidden || (t.verdict !== "accepted" && t.verdict !== "skipped"));
  const hidden = result.tests.filter((t) => t.hidden);
  const hiddenPassed = hidden.filter((t) => t.verdict === "accepted").length;
  const hiddenSkipped = hidden.filter((t) => t.verdict === "skipped").length;
  const firstBad = chips.findIndex((t) => t.verdict !== "accepted" && t.verdict !== "ran" && t.verdict !== "skipped");
  const [picked, setPicked] = useState<string | null>(null);
  const shown = chips.find((t) => t.id === picked) ?? chips[firstBad >= 0 ? firstBad : 0];
  const label = result.kind === "submit" ? VERDICT_LABELS[result.verdict] : result.verdict === "accepted" ? "Samples passed" : VERDICT_LABELS[result.verdict];

  return (
    <div className="space-y-3 p-3" data-testid="verdict-panel">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className={cn("text-lg font-semibold", verdictColor(result.verdict))} data-testid="verdict">
          {label}
        </h3>
        <span className="text-muted-foreground text-sm" data-testid="counts">
          {result.passed}/{result.total} {result.kind === "submit" ? "tests" : "samples"} passed
          {result.maxTimeMs !== null && ` · ${result.maxTimeMs.toFixed(1)} ms`}
          {result.maxMemoryKb !== null && ` · ${(result.maxMemoryKb / 1024).toFixed(1)} MB`}
        </span>
      </div>

      {result.efficiency && (
        <p className="text-sm" data-testid="efficiency">
          {EFFICIENCY_TEXT[result.efficiency.rating]}{" "}
          <span className="text-muted-foreground">
            ({result.efficiency.userMs.toFixed(1)} ms vs {result.efficiency.referenceMs.toFixed(1)} ms for its slowest test)
          </span>
        </p>
      )}

      {result.compileOutput && <Block title="Compiler output" tone="error">{result.compileOutput}</Block>}

      {chips.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tests">
            {chips.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={shown?.id === t.id}
                onClick={() => setPicked(t.id)}
                className={cn(
                  "rounded-md border border-border px-2 py-0.5 text-xs",
                  shown?.id === t.id && "bg-muted font-medium",
                )}
              >
                <span className={verdictColor(t.verdict)}>●</span> {t.label}
              </button>
            ))}
          </div>
          {hidden.length > 0 && (
            <p className="text-muted-foreground text-xs" data-testid="hidden-summary">
              {hiddenPassed} of {hidden.length} hidden tests passed
              {hiddenSkipped > 0 && `, ${hiddenSkipped} not run because an earlier test failed`}.
            </p>
          )}
          {shown && (
            <div>
              <p className={cn("mb-2 text-sm", verdictColor(shown.verdict))}>
                {shown.label}: {VERDICT_LABELS[shown.verdict]}
                {shown.timeMs !== null && <span className="text-muted-foreground"> · {shown.timeMs.toFixed(1)} ms</span>}
              </p>
              <TestDetail test={shown} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
