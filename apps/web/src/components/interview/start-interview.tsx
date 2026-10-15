"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type Interviewer = "ai" | "scripted" | "packet";

/** Starts a timed mock interview on this problem with the chosen kind of interviewer. */
export function StartInterview({ slug, aiConnected, round = "dsa", minutes = 50, fluencyType }: { slug: string; aiConnected: boolean; round?: "dsa" | "lld" | "fluency"; minutes?: number; fluencyType?: "comprehension" | "review" | "extension" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Interviewer>(aiConnected ? "ai" : "scripted");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/interview", "POST", { round, slug, interviewer: choice, ...(fluencyType ? { type: fluencyType } : {}) });
      router.push(`/interview/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const options: { value: Interviewer; label: string; detail: string; disabled?: boolean }[] = [
    {
      value: "ai",
      label: "AI interviewer",
      detail: aiConnected ? "The configured model runs the interview live." : "Configure a provider in Settings to use this.",
      disabled: !aiConnected,
    },
    { value: "scripted", label: "Scripted interviewer", detail: "No AI: timed phases, prompts, and follow-up questions." },
    { value: "packet", label: "In another chat", detail: "Copy a prompt into claude.ai or any assistant; this page keeps time and runs your code." },
  ];

  return (
    <div className="relative">
      <Button variant="outline" className="h-7 px-3 text-xs" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="open-interview">
        Start a mock interview
      </Button>
      {open && (
        <div role="dialog" aria-label="Start a mock interview" className="bg-background absolute right-0 z-20 mt-2 w-96 space-y-3 rounded-lg border border-border p-4 shadow-xl">
          <p className="text-sm">
            {round === "fluency"
              ? `A ${minutes}-minute interview with an interviewer chat, a strict clock, and the AI assistant. Everything you ask it and apply is logged for the debrief.`
              : round === "lld"
              ? `A ${minutes}-minute design interview: clarify, design, implement, then a new requirement about 60% of the way in. Hints lower your score; the reference waits for the debrief.`
              : `A ${minutes}-minute interview with phases (clarify, approach, code, test) and a strict clock. Hints lower your score; the editorial waits for the debrief.`}
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Interviewer</legend>
            {options.map((o) => (
              <label key={o.value} className="flex items-start gap-2 text-sm has-[:disabled]:opacity-50">
                <input type="radio" name="interviewer" value={o.value} checked={choice === o.value} disabled={o.disabled} onChange={() => setChoice(o.value)} className="mt-1" />
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="text-muted-foreground block text-xs">{o.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button onClick={start} disabled={busy} data-testid="start-interview">
            {busy ? "Starting…" : "Start the clock"}
          </Button>
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
