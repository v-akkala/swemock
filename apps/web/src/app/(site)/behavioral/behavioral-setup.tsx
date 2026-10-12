"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMPETENCIES, LENSES } from "@swemock/shared";
import { InterviewerChoice, type Interviewer } from "@/components/interview/interviewer-choice";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function BehavioralSetup({ aiConnected, gaps }: { aiConnected: boolean; gaps: string[] }) {
  const router = useRouter();
  const [count, setCount] = useState(5);
  const [lens, setLens] = useState<string>("");
  const [focus, setFocus] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<Interviewer>(aiConnected ? "ai" : "scripted");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setFocus((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/interview", "POST", {
        round: "behavioral",
        interviewer: choice,
        count,
        lens: lens || null,
        focus: [...focus],
      });
      router.push(`/interview/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="mock-heading" className="space-y-4">
      <h2 id="mock-heading" className="text-lg font-semibold">
        Start a mock interview
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Questions</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="bg-card h-9 w-full rounded-md border border-border px-2" data-testid="count">
            {[4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} questions (about {n * 6 + 5} minutes)
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Company lens (optional)</span>
          <select value={lens} onChange={(e) => setLens(e.target.value)} className="bg-card h-9 w-full rounded-md border border-border px-2" data-testid="lens">
            <option value="">None</option>
            {LENSES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Focus on (optional)</legend>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {COMPETENCIES.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={focus.has(c.id)} onChange={() => toggle(c.id)} data-testid={`focus-${c.id}`} />
              <span>
                {c.label}
                {gaps.includes(c.id) && <span className="text-muted-foreground text-xs"> (no story yet)</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <InterviewerChoice value={choice} onChange={setChoice} aiConnected={aiConnected} packetDetail="Copy a prompt into claude.ai or any assistant; this page keeps time and grades afterwards." />
      <Button onClick={() => void start()} disabled={busy} data-testid="start-behavioral">
        {busy ? "Starting…" : "Start the interview"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
