"use client";

import { useState } from "react";
import { competencyLabel, type ResumeFeedback, type RewriteResult } from "@swemock/shared";
import { PacketPanel } from "@/components/ai/packet-panel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BehavioralDebrief, RecruiterDebrief } from "@/server/debrief";

const GRADE = ["Missed it", "Partly", "Got it"] as const;
const GRADE_STYLE = ["bg-red-500/15 text-red-700 dark:text-red-300", "bg-amber-500/15 text-amber-700 dark:text-amber-300", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"] as const;
const FLAG_LABEL: Record<string, string> = { metric: "metric", number: "number", "strong-claim": "strong claim", buzzword: "buzzword", vague: "vague" };

/** Resume feedback or stronger answer versions: connected model, or a packet pasted back. */
function FeedbackSource<T>({
  sessionId,
  kind,
  aiConnected,
  title,
  description,
  onDone,
}: {
  sessionId: string;
  kind: "resume-feedback" | "behavioral-rewrite";
  aiConnected: boolean;
  title: string;
  description: string;
  onDone: (value: T) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (aiConnected) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">{description}</p>
        <Button
          variant="outline"
          disabled={busy}
          data-testid={`ai-${kind}`}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              onDone((await api<{ feedback: T }>(`/api/debrief/${sessionId}/feedback`, "POST", { kind })).feedback);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : title}
        </Button>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
  return (
    <PacketPanel
      kind={kind}
      sessionId={sessionId}
      title={title}
      description={`${description} Copy this packet into claude.ai or another assistant, then paste its whole reply here.`}
      expectsJson
      onPasted={(result) => {
        const feedback = (result as { feedback?: T }).feedback;
        if (feedback) onDone(feedback);
      }}
    />
  );
}

export function RecruiterExtras({ sessionId, data, aiConnected }: { sessionId: string; data: RecruiterDebrief; aiConnected: boolean }) {
  const [feedback, setFeedback] = useState<ResumeFeedback | null>(data.feedback?.result ?? null);
  return (
    <div className="space-y-10">
      <section aria-labelledby="fund-heading" className="space-y-3" data-testid="fundamentals-review">
        <h2 id="fund-heading" className="text-lg font-semibold">
          Fundamentals review
        </h2>
        {data.questions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No fundamentals questions were asked here.</p>
        ) : (
          <ul className="space-y-4">
            {data.questions.map((q) => (
              <li key={q.id} className="bg-card space-y-2 rounded-md border border-border p-3 text-sm" data-testid={`fund-${q.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{q.prompt.trim()}</span>
                  <span className="bg-muted rounded px-1.5 py-0.5 text-xs">{q.difficulty}</span>
                  {q.grade !== null && <span className={cn("rounded px-1.5 py-0.5 text-xs", GRADE_STYLE[q.grade])}>You: {GRADE[q.grade]}</span>}
                </div>
                {q.answer && (
                  <p className="text-muted-foreground whitespace-pre-wrap text-xs">
                    <span className="font-medium">Your answer:</span> {q.answer}
                  </p>
                )}
                <div>
                  <p className="text-xs font-medium">Key points</p>
                  <ul className="list-disc pl-5 text-xs">
                    {q.keyPoints.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </div>
                <details>
                  <summary className="text-muted-foreground cursor-pointer text-xs">Model answer</summary>
                  <p className="mt-1 text-xs">{q.modelAnswer}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="resume-fb-heading" className="space-y-3" data-testid="resume-feedback">
        <h2 id="resume-fb-heading" className="text-lg font-semibold">
          Resume feedback
        </h2>
        {data.probes.length > 0 && (
          <div>
            <p className="text-sm font-medium">Bullets the recruiter went after</p>
            <ul className="mt-1 space-y-1 text-sm">
              {data.probes.map((b) => (
                <li key={b.text}>
                  {b.text}
                  {b.flags.map((f) => (
                    <span key={f} className="bg-muted ml-1 rounded px-1.5 py-0.5 text-[10px]">
                      {FLAG_LABEL[f] ?? f}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
        {feedback ? (
          <div className="space-y-3">
            <p className="text-sm">{feedback.summary}</p>
            <ul className="space-y-3">
              {feedback.bullets.map((b) => (
                <li key={b.original} className="bg-card space-y-1 rounded-md border border-border p-3 text-sm">
                  <p className="text-muted-foreground text-xs line-through">{b.original}</p>
                  <p>
                    <span className="font-medium">Suggested:</span> {b.rewrite}
                  </p>
                  <p className="text-xs">
                    {b.drew_followup ? "Drew a follow-up. " : ""}Could you back it up? <strong>{b.could_back_up}</strong>. {b.problem}
                  </p>
                  {b.needs_from_candidate.length > 0 && (
                    <p className="text-xs">
                      <span className="font-medium">Add before using it:</span> {b.needs_from_candidate.join("; ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <FeedbackSource<ResumeFeedback>
            sessionId={sessionId}
            kind="resume-feedback"
            aiConnected={aiConnected}
            title="Get resume feedback"
            description="Suggested rewrites for the bullets that drew follow-ups, using only facts you gave."
            onDone={setFeedback}
          />
        )}
      </section>
    </div>
  );
}

function Chips({ s }: { s: BehavioralDebrief["turns"][number]["signals"] }) {
  const chip = "bg-muted rounded px-1.5 py-0.5 text-[10px]";
  return (
    <div className="mt-1 flex flex-wrap gap-1" data-testid="signals">
      <span className={chip}>{s.words} words</span>
      {s.durationSec !== null && <span className={chip}>{s.durationSec}s to answer</span>}
      {s.iShare !== null && <span className={chip}>{Math.round(s.iShare * 100)}% “I”</span>}
      <span className={chip}>{s.hasNumber ? "has a number" : "no number"}</span>
      {s.fillers !== null && <span className={chip}>{s.fillers} fillers</span>}
      {s.wpm !== null && <span className={chip}>{s.wpm} wpm</span>}
    </div>
  );
}

export function BehavioralExtras({ sessionId, data, aiConnected }: { sessionId: string; data: BehavioralDebrief; aiConnected: boolean }) {
  const [rewrites, setRewrites] = useState<RewriteResult | null>(data.rewrites?.result ?? null);
  const answers = data.turns.filter((t) => t.counts);
  return (
    <div className="space-y-10">
      <section aria-labelledby="answers-heading" className="space-y-3" data-testid="answer-review">
        <h2 id="answers-heading" className="text-lg font-semibold">
          Your answers
        </h2>
        {answers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No full answers were recorded (a message needs about 25 words to count as one).</p>
        ) : (
          <ol className="space-y-3">
            {answers.map((t, i) => (
              <li key={i} className="bg-card rounded-md border border-border p-3 text-sm">
                {t.prompt && <p className="text-muted-foreground text-xs">{t.prompt}</p>}
                <p className="mt-1 whitespace-pre-wrap">{t.text}</p>
                <Chips s={t.signals} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="rewrite-heading" className="space-y-3" data-testid="rewrites">
        <h2 id="rewrite-heading" className="text-lg font-semibold">
          Stronger versions
        </h2>
        {rewrites ? (
          <ul className="space-y-3">
            {rewrites.answers.map((a, i) => (
              <li key={i} className="bg-card space-y-2 rounded-md border border-border p-3 text-sm">
                <p className="text-muted-foreground text-xs">{a.question}</p>
                <p className="whitespace-pre-wrap">{a.stronger_version}</p>
                {a.missing_facts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium">Facts to add (not invented):</p>
                    <ul className="list-disc pl-5 text-xs">
                      {a.missing_facts.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <FeedbackSource<RewriteResult>
            sessionId={sessionId}
            kind="behavioral-rewrite"
            aiConnected={aiConnected}
            title="Write stronger versions"
            description="Each answer rewritten using only the facts you gave (and the stories you saved), plus a list of what's missing."
            onDone={setRewrites}
          />
        )}
      </section>

      <section aria-labelledby="bq-heading" className="space-y-3" data-testid="question-review">
        <h2 id="bq-heading" className="text-lg font-semibold">
          What a strong answer contains
        </h2>
        <ul className="space-y-4">
          {data.questions.map((q) => (
            <li key={q.id} className="bg-card space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{q.prompt.trim()}</p>
              <p className="text-muted-foreground text-xs">{q.competencies.map(competencyLabel).join(" · ")}</p>
              <ul className="list-disc pl-5 text-xs">
                {q.strongSignals.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {q.redFlags.length > 0 && (
                <p className="text-xs text-red-700 dark:text-red-300">
                  <span className="font-medium">Red flags:</span> {q.redFlags.join("; ")}
                </p>
              )}
              {q.tips && <p className="text-xs">{q.tips.trim()}</p>}
              <details>
                <summary className="text-muted-foreground cursor-pointer text-xs">Follow-ups an interviewer might ask</summary>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {q.followUps.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
