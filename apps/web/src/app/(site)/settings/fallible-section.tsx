"use client";

import { useState } from "react";
import type { Settings } from "@swemock/shared";
import { patchSettings } from "@/lib/api";

/** The fallible-mode feature flag (spec §8.4): off by default. */
export function FallibleSection({ initial }: { initial: Settings }) {
  const [on, setOn] = useState(initial.features.fallibleMode);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setOn(next);
    setError(null);
    try {
      await patchSettings({ features: { ...initial.features, fallibleMode: next } });
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section aria-labelledby="fallible-heading" className="space-y-2">
      <h2 id="fallible-heading" className="text-lg font-semibold">
        Fallible mode
      </h2>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => void change(e.target.checked)} className="mt-1" data-testid="fallible-flag" />
        <span>
          Let the AI assistant make occasional mistakes in the AI Fluency rounds
          <span className="text-muted-foreground block text-xs">
            About one in five code-producing assistant replies, from a connected model or pasted back, gets one small, plausible mistake (an off-by-one, a flipped comparison, a removed check, swapped
            arguments, a changed default, or a dropped close) before the diff preview. The code still parses. The debrief reveals each one and whether you caught it. Works with every provider.
          </span>
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
