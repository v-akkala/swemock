"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const MIX_LABEL: Record<string, string> = {
  "easy-medium": "One easy, one medium",
  "medium-medium": "Two mediums",
  "medium-hard": "One medium, one hard",
};

export function OaSetup({ mixes }: { mixes: string[] }) {
  const router = useRouter();
  const [durationMin, setDuration] = useState(70);
  const [mix, setMix] = useState(mixes[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/dsa/oa", "POST", { durationMin, mix });
      router.push(`/dsa/oa/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="start-heading" className="space-y-4 rounded-lg border border-border p-4">
      <h2 id="start-heading" className="font-semibold">
        Start an assessment
      </h2>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">Time</legend>
        {[70, 80, 90].map((m) => (
          <label key={m} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input type="radio" name="duration" checked={durationMin === m} onChange={() => setDuration(m)} />
            {m} minutes
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">Problems</legend>
        {mixes.map((m) => (
          <label key={m} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input type="radio" name="mix" checked={mix === m} onChange={() => setMix(m)} />
            {MIX_LABEL[m] ?? m}
          </label>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-xs">Problems you haven&apos;t solved yet are preferred.</p>
      <Button onClick={start} disabled={busy} data-testid="start-oa">
        {busy ? "Starting…" : "Start the clock"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
