"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RECOMMENDATION_LABELS, type Language } from "@swemock/shared";
import { PacketPanel } from "@/components/ai/packet-panel";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DebriefData } from "@/server/debrief";
import type { ScorecardView } from "@/server/scoring/scorecard";
import { BehavioralExtras, RecruiterExtras } from "./conversation-debrief";
import { DesignView } from "@/components/lld/design-view";
import { LANGUAGE_LABELS } from "@swemock/shared";

const SOURCE_STYLE = {
  auto: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  self: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ai: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
} as const;

function mmss(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function DebriefView({ data }: { data: DebriefData }) {
  const router = useRouter();
  const [card, setCard] = useState<ScorecardView | null>(data.scorecard);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const interview = data.session.mode === "interview";

  async function action(path: string, done: (r: unknown) => void) {
    setBusy(true);
    setMessage(null);
    try {
      done(await api(`/api/debrief/${data.session.id}/${path}`, "POST", {}));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      {card && <Scorecard card={card} />}

      {card && interview && (
        <section aria-labelledby="grade-heading" className="grid gap-6 lg:grid-cols-2">
          <SelfChecklist sessionId={data.session.id} card={card} onSaved={setCard} />
          <div className="space-y-3">
            <h2 id="grade-heading" className="text-lg font-semibold">
              AI grading
            </h2>
            {data.aiConnected ? (
              <>
                <p className="text-muted-foreground text-sm">The grader model scores every dimension with evidence from your transcript and code.</p>
                <Button disabled={busy} onClick={() => void action("grade", (r) => setCard(r as ScorecardView))} data-testid="grade-ai">
                  {busy ? "Grading…" : card.ai ? "Grade again" : "Grade with AI"}
                </Button>
              </>
            ) : (
              <PacketPanel
                kind={`${data.roundType}-grading` as "dsa-grading" | "recruiter-grading" | "behavioral-grading"}
                sessionId={data.session.id}
                title="Grade with any chatbot"
                description="Copy this grading packet (rubric, transcript, and events) into claude.ai or another assistant, then paste its whole reply here."
                expectsJson
                onPasted={(result) => {
                  const scorecard = (result as { scorecard?: ScorecardView }).scorecard;
                  if (scorecard) setCard(scorecard);
                }}
              />
            )}
          </div>
        </section>
      )}

      {data.recruiter && <RecruiterExtras sessionId={data.session.id} data={data.recruiter} aiConnected={data.aiConnected} />}
      {data.behavioral && <BehavioralExtras sessionId={data.session.id} data={data.behavioral} aiConnected={data.aiConnected} />}

      {data.frames.length > 0 && <Replay frames={data.frames} withCode={data.roundType === "dsa"} />}

      {data.reveal && (
        <section aria-labelledby="reveal-heading" className="space-y-4">
          <h2 id="reveal-heading" className="text-lg font-semibold">
            Reference
          </h2>
          <Markdown>{data.reveal.editorialMd}</Markdown>
          <References references={data.reveal.references} />
          {data.reveal.followups.length > 0 && (
            <div>
              <h3 className="font-medium">Follow-up questions an interviewer might ask</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {data.reveal.followups.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {data.lld && (
        <section aria-labelledby="lld-heading" className="space-y-4" data-testid="lld-reveal">
          <h2 id="lld-heading" className="text-lg font-semibold">
            Reference
          </h2>
          <div>
            <h3 className="font-medium">The requirement change</h3>
            <div className="mt-1 text-sm">
              <Markdown>{data.lld.change}</Markdown>
            </div>
          </div>
          <DesignView reveal={data.lld.design} languages={Object.keys(data.lld.design.references).map((id) => ({ id, label: LANGUAGE_LABELS[id as "python" | "cpp"] ?? id }))} />
          {data.lld.followups.length > 0 && (
            <div>
              <h3 className="font-medium">Follow-up questions an interviewer might ask</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {data.lld.followups.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {interview && (
          <Button variant="outline" disabled={busy} onClick={() => void action("redo", (r) => router.push(`/interview/${(r as { id: string }).id}`))} data-testid="redo">
            Redo this interview
          </Button>
        )}
        {data.problem && (
          <Button variant="outline" disabled={busy} onClick={() => void action("review", () => setMessage("Added: it comes back tomorrow, then after 3, 7, and 14 days."))} data-testid="add-review">
            Add to review queue
          </Button>
        )}
        {data.problem && data.problemHref && (
          <Button variant="ghost" onClick={() => router.push(data.problemHref!)}>
            Practice this problem
          </Button>
        )}
        {message && <p role="status" className="text-muted-foreground self-center text-sm">{message}</p>}
      </div>
      {data.usage.total > 0 && (
        <p className="text-muted-foreground text-xs">
          Tokens used in this session: {data.usage.total.toLocaleString()} ({data.usage.cacheReadTokens.toLocaleString()} read from cache).
        </p>
      )}
    </div>
  );
}

function Scorecard({ card }: { card: ScorecardView }) {
  return (
    <section aria-labelledby="scorecard-heading" className="space-y-4" data-testid="scorecard">
      <div className="flex flex-wrap items-baseline gap-4">
        <h2 id="scorecard-heading" className="text-lg font-semibold">
          Scorecard
        </h2>
        {card.recommendation ? (
          <span className="text-xl font-semibold" data-testid="recommendation">
            {RECOMMENDATION_LABELS[card.recommendation]}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm" data-testid="recommendation">
            Objective metrics only. Score yourself or grade with AI for a recommendation.
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          Sources:{" "}
          {card.sources.map((s) => (
            <span key={s} className={cn("mr-1 rounded px-1.5 py-0.5", SOURCE_STYLE[s])}>
              {s}
            </span>
          ))}
          · formula v{card.formulaVersion}
        </span>
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3" data-testid="metrics">
        {card.metricLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1">Dimension</th>
            <th>Score</th>
            <th>By source</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {card.rubric.dimensions.map((d) => {
            const final = card.final[d.id];
            const all = card.scores.filter((s) => s.dimension === d.id);
            return (
              <tr key={d.id} className="border-t border-border align-top" data-testid={`dim-${d.id}`}>
                <td className="py-2 pr-2 font-medium">{d.label}</td>
                <td className="pr-2 text-lg font-semibold">{final ? `${final.score}/4` : "—"}</td>
                <td className="pr-2">
                  {all.map((s) => (
                    <span key={s.source} className={cn("mr-1 inline-block rounded px-1.5 py-0.5 text-xs", SOURCE_STYLE[s.source])}>
                      {s.source} {s.score}
                    </span>
                  ))}
                </td>
                <td className="text-muted-foreground text-xs">{final?.evidence.slice(0, 3).join(" · ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {card.ai && (
        <div className="grid gap-4 text-sm md:grid-cols-3" data-testid="ai-feedback">
          <div>
            <h3 className="font-medium">Strengths</h3>
            <ul className="mt-1 list-disc pl-5">{card.ai.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div>
            <h3 className="font-medium">Improve next time</h3>
            <ul className="mt-1 list-disc pl-5">{card.ai.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div>
            <h3 className="font-medium">What a strong candidate would have done</h3>
            <p className="mt-1">{card.ai.strongCandidate}</p>
            <p className="text-muted-foreground mt-2 text-xs">
              Grader: {card.ai.grader} ({RECOMMENDATION_LABELS[card.ai.recommendation]}) · {card.ai.promptVersion}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function SelfChecklist({ sessionId, card, onSaved }: { sessionId: string; card: ScorecardView; onSaved: (c: ScorecardView) => void }) {
  const [ticked, setTicked] = useState(new Set(card.selfTicked ?? []));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const toggle = (id: string) =>
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  async function save() {
    setBusy(true);
    try {
      onSaved(await api<ScorecardView>(`/api/debrief/${sessionId}/self`, "POST", { ticked: [...ticked] }));
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3" data-testid="self-checklist">
      <h2 className="text-lg font-semibold">Score yourself</h2>
      <p className="text-muted-foreground text-sm">The rubric, revealed. Tick what you actually did; red flags count against you.</p>
      {card.rubric.dimensions.map((d) => (
        <fieldset key={d.id} className="space-y-1">
          <legend className="text-sm font-medium">{d.label}</legend>
          {d.items.map((i) => (
            <label key={i.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={ticked.has(i.id)} onChange={() => toggle(i.id)} className="mt-1" data-item={i.id} />
              <span className={cn(i.kind === "red" && "text-red-600 dark:text-red-400")}>
                {i.kind === "red" ? "Red flag: " : i.kind === "strong" ? "Strong signal: " : ""}
                {i.text}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <Button onClick={() => void save()} disabled={busy} data-testid="save-self">
        {busy ? "Saving…" : "Save self-score"}
      </Button>
      {saved && <p role="status" className="text-muted-foreground text-xs">Saved.</p>}
    </div>
  );
}

function Replay({ frames, withCode }: { frames: DebriefData["frames"]; withCode: boolean }) {
  const [index, setIndex] = useState(frames.length - 1);
  const frame = frames[index]!;
  const chat = useMemo(() => frames.slice(0, index + 1).filter((f) => f.kind === "chat"), [frames, index]);
  return (
    <section aria-labelledby="replay-heading" className="space-y-3" data-testid="replay">
      <h2 id="replay-heading" className="text-lg font-semibold">
        Replay
      </h2>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Timeline position"
          className="flex-1"
        />
        <span className="font-mono text-sm tabular-nums">{mmss(frame.at)}</span>
      </div>
      <p className="text-sm">
        <strong>{frame.label}</strong>
        {frame.detail && frame.kind !== "chat" && <span className="text-muted-foreground"> · {frame.detail}</span>}
      </p>
      <div className={cn("grid gap-4", withCode && "lg:grid-cols-2")}>
        {withCode && <div>
          <p className="text-muted-foreground mb-1 text-xs">Code at {mmss(frame.at)}{frame.code ? ` (${frame.code.language})` : ""}</p>
          <pre className="bg-muted h-80 overflow-auto rounded-md p-3 font-mono text-xs">{frame.code?.code ?? "(no code yet)"}</pre>
        </div>}
        <div>
          <p className="text-muted-foreground mb-1 text-xs">Conversation so far</p>
          <ol className="bg-muted h-80 space-y-2 overflow-auto rounded-md p-3 text-xs">
            {chat.length === 0 && <li className="text-muted-foreground">(no messages)</li>}
            {chat.map((c) => (
              <li key={c.ts + c.label}>
                <span className="text-muted-foreground font-mono">[{mmss(c.at)}]</span> <strong>{c.label}:</strong> <span className="whitespace-pre-wrap">{c.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <details>
        <summary className="text-muted-foreground cursor-pointer text-xs">All events ({frames.length})</summary>
        <ol className="mt-2 space-y-1 text-xs">
          {frames.map((f, i) => (
            <li key={i}>
              <button className={cn("text-left hover:underline", i === index && "font-semibold")} onClick={() => setIndex(i)}>
                [{mmss(f.at)}] {f.label}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function References({ references }: { references: Partial<Record<Language, string>> }) {
  const langs = (Object.keys(references) as Language[]).filter((l) => references[l]);
  const [pick, setPick] = useState(langs[0]);
  if (!pick) return null;
  return (
    <div>
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Reference solution language">
        {langs.map((l) => (
          <button key={l} role="tab" aria-selected={pick === l} onClick={() => setPick(l)} className={cn("rounded-md border border-border px-2 py-0.5 text-xs", pick === l && "bg-muted font-medium")}>
            {l === "cpp" ? "C++" : "Python"}
          </button>
        ))}
      </div>
      <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs">{references[pick]}</pre>
    </div>
  );
}
