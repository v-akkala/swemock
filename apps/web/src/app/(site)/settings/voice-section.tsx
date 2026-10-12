"use client";

import { useState } from "react";
import type { Settings } from "@swemock/shared";
import { patchSettings } from "@/lib/api";

/** The voice-input feature flag (spec §3): off by default, with a plain statement of where audio goes. */
export function VoiceSection({ initial }: { initial: Settings }) {
  const [on, setOn] = useState(initial.features.voiceInput);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setOn(next);
    setError(null);
    try {
      await patchSettings({ features: { ...initial.features, voiceInput: next } });
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section aria-labelledby="voice-heading" className="space-y-2">
      <h2 id="voice-heading" className="text-lg font-semibold">
        Voice input
      </h2>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => void change(e.target.checked)} className="mt-1" data-testid="voice-flag" />
        <span>
          Let me speak my answers in the recruiter and behavioral rounds
          <span className="text-muted-foreground block text-xs">
            Uses your browser&apos;s built-in speech recognition. In Chrome and Edge the browser sends the audio to Google or Microsoft to transcribe it; Safari
            may use Apple&apos;s service. swemock itself never receives audio, only the text you send. When it&apos;s on, the debrief shows filler words and words per
            minute. Typing always works.
          </span>
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
