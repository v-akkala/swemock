"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FluencyDebrief } from "@/server/debrief";
import type { ScorecardView } from "@/server/scoring/scorecard";

const SEV: Record<string, string> = {
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300",
};
const where = (f: { file: string; lines: [number, number] }) => `${f.file}:${f.lines[0]}${f.lines[1] !== f.lines[0] ? `-${f.lines[1]}` : ""}`;

export function FluencyExtras({ sessionId, data, onCard }: { sessionId: string; data: FluencyDebrief; onCard: (c: ScorecardView) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, string | false>>({});
  const noun = data.type === "review" ? "comment" : "finding";
  // Borderline calls made on this page take effect at once; the scorecard is refreshed from the server.
  const plantedStatus = (p: FluencyDebrief["planted"][number]) =>
    p.status !== "borderline" ? p.status : Object.values(decided).includes(p.id) ? ("found" as const) : data.findings.some((f) => f.plantedId === p.id && f.verdict === "borderline" && decided[f.id] === undefined) ? ("borderline" as const) : ("missed" as const);
  const findingVerdict = (f: FluencyDebrief["findings"][number]) => (decided[f.id] === undefined ? f.verdict : decided[f.id] === false ? ("false-positive" as const) : ("match" as const));

  async function decide(findingId: string, plantedId: string | false) {
    setBusy(findingId);
    try {
      const card = await api<ScorecardView>(`/api/debrief/${sessionId}/match`, "POST", { findingId, plantedId });
      setDecided((d) => ({ ...d, [findingId]: plantedId }));
      onCard(card);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-10" data-testid="fluency-review">
      {data.type !== "extension" && (
        <>
          <section aria-labelledby="planted-h" className="space-y-3" data-testid="planted">
            <h2 id="planted-h" className="text-lg font-semibold">
              {data.type === "review" ? "What was seeded in this pull request" : "What was planted in this codebase"}
            </h2>
            {data.type === "review" && (
              <p className="text-sm" data-testid="correct-decision">
                The right call: <strong>{data.decision.correct?.replace("_", " ")}</strong>
                {data.decision.given ? <> · yours: <strong>{data.decision.given.replace("_", " ")}</strong></> : " · you didn't decide"}
                {data.decision.correct === "approve" && " (a correct change: approve with nits; blocking comments are over-flagging)"}
              </p>
            )}
            {data.planted.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing was seeded: this change was fine.</p>
            ) : (
              <ul className="space-y-2">
                {data.planted.map((planted0) => {
                  const p = { ...planted0, status: plantedStatus(planted0) };
                  return (
                  <li key={p.id} className="bg-card rounded-md border border-border p-3 text-sm" data-testid={`planted-${p.id}`} data-status={p.status}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn("rounded px-1.5 py-0.5 font-medium", p.status === "found" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : p.status === "borderline" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-red-500/15 text-red-700 dark:text-red-300")}>
                        {p.status === "found" ? "Found" : p.status === "borderline" ? "Borderline" : "Missed"}
                      </span>
                      <span className="font-mono">{where(p)}</span>
                      <span className="bg-muted rounded px-1.5 py-0.5">{p.category}</span>
                      <span className={cn("rounded px-1.5 py-0.5", SEV[p.severity])}>{p.severity}</span>
                    </div>
                    <p className="mt-1 font-medium">{p.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">{p.explanation}</p>
                  </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="yours-h" className="space-y-3" data-testid="your-findings">
            <h2 id="yours-h" className="text-lg font-semibold">
              Your {noun}s
            </h2>
            {data.findings.length === 0 ? (
              <p className="text-muted-foreground text-sm">You didn&apos;t mark any.</p>
            ) : (
              <ul className="space-y-2">
                {data.findings.map((f) => {
                  const planted = data.planted.find((p) => p.id === f.plantedId);
                  const verdict = findingVerdict(f);
                  const confirmed = f.confirmed || (decided[f.id] !== undefined && decided[f.id] !== false);
                  return (
                    <li key={f.id} className="rounded-md border border-border p-3 text-sm" data-testid="your-finding" data-verdict={verdict}>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono">{where(f)}</span>
                        <span className="bg-muted rounded px-1.5 py-0.5">{f.category}</span>
                        <span className={cn("rounded px-1.5 py-0.5", SEV[f.severity])}>{f.severity}</span>
                        <span className="text-muted-foreground ml-auto">
                          {verdict === "match" ? `matches “${planted?.title ?? f.plantedId}”${confirmed ? " (you confirmed it)" : ""}` : verdict === "acceptable" ? "a real issue that wasn't planted: not counted against you" : verdict === "borderline" ? "right place, different category" : "no planted issue here"}
                        </span>
                      </div>
                      {f.text && <p className="mt-1 whitespace-pre-wrap text-xs">{f.text}</p>}
                      {verdict === "borderline" && f.plantedId && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="borderline">
                          <span>Is this the same problem as “{planted?.title}” ({planted?.category})?</span>
                          <Button variant="outline" className="h-7 text-xs" disabled={busy === f.id} onClick={() => void decide(f.id, f.plantedId!)} data-testid="confirm-match">
                            Yes, it matches
                          </Button>
                          <Button variant="ghost" className="h-7 text-xs" disabled={busy === f.id} onClick={() => void decide(f.id, false)} data-testid="reject-match">
                            No
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {data.type === "comprehension" && data.summary.trim() && (
              <details open>
                <summary className="cursor-pointer text-sm font-medium">Your summary of the system</summary>
                <p className="mt-1 whitespace-pre-wrap text-sm">{data.summary}</p>
              </details>
            )}
            {data.type === "review" && data.decision.summary && (
              <details open>
                <summary className="cursor-pointer text-sm font-medium">Your summary comment</summary>
                <p className="mt-1 whitespace-pre-wrap text-sm">{data.decision.summary}</p>
              </details>
            )}
          </section>

          {data.type === "comprehension" && (
            <section aria-labelledby="design-h" className="space-y-3" data-testid="design-notes">
              <h2 id="design-h" className="text-lg font-semibold">
                Design decisions and improvements
              </h2>
              <ul className="space-y-2 text-sm">
                {data.decisions.map((d) => (
                  <li key={d.title} className="bg-card rounded-md border border-border p-3">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs"><strong>For:</strong> {d.for}</p>
                    <p className="text-xs"><strong>Against:</strong> {d.against}</p>
                  </li>
                ))}
              </ul>
              <div>
                <p className="text-sm font-medium">Improvement opportunities</p>
                <ul className="list-disc pl-5 text-sm">
                  {data.improvements.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          {data.acceptable.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Real but unplanted issues (not counted against you): {data.acceptable.map((a) => `${where(a)} ${a.note}`).join(" · ")}
            </p>
          )}
        </>
      )}

      {data.type === "extension" && (
        <section aria-labelledby="ext-h" className="space-y-3" data-testid="extension-review">
          <h2 id="ext-h" className="text-lg font-semibold">
            Your change and the reference
          </h2>
          <p className="text-sm">You changed: {data.changedFiles.length ? data.changedFiles.map((f) => <code key={f} className="bg-muted mr-1 rounded px-1">{f}</code>) : "nothing"}</p>
          {data.reference && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">The reference implementation (changed files)</summary>
              {Object.entries(data.reference).map(([p, t]) => (
                <div key={p} className="mt-2">
                  <p className="text-muted-foreground font-mono text-xs">{p}</p>
                  <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs">{t}</pre>
                </div>
              ))}
            </details>
          )}
        </section>
      )}

      <section aria-labelledby="ai-h" className="space-y-3" data-testid="assistant-review">
        <h2 id="ai-h" className="text-lg font-semibold">
          How you used the assistant
        </h2>
        {data.assistant.length === 0 ? (
          <p className="text-muted-foreground text-sm">You didn&apos;t use the assistant.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {data.assistant.map((a, i) => (
              <li key={i} data-testid="assistant-entry">
                <span className="text-muted-foreground text-xs">[{a.via}] </span>
                {a.question}
                <span className="text-muted-foreground text-xs"> · applied {a.applied.accepted} hunk(s), rejected {a.applied.rejected}</span>
              </li>
            ))}
          </ol>
        )}
        {data.mutations.length > 0 && (
          <div data-testid="mutations">
            <p className="text-sm font-medium">Fallible mode: mistakes the assistant&apos;s code was given</p>
            <ul className="mt-1 space-y-2">
              {data.mutations.map((m, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs" data-testid="mutation" data-caught={m.caught}>
                  <span className={cn("mr-2 rounded px-1.5 py-0.5 font-medium", m.caught ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300")}>
                    {m.how === "rejected" ? "Caught: you rejected it" : m.how === "fixed" ? "Caught: you fixed it" : "Missed"}
                  </span>
                  <span className="font-mono">
                    {m.path}:{m.line}
                  </span>{" "}
                  ({m.op})
                  <pre className="bg-muted mt-1 overflow-auto rounded p-1.5 font-mono">
                    <div className="text-red-700 dark:text-red-300">- {m.before.trim()}</div>
                    <div className="text-emerald-700 dark:text-emerald-300">+ {m.after.trim() || "(line removed)"}</div>
                  </pre>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
