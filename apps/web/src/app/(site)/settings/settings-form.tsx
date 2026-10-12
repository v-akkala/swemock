"use client";

import type { Settings } from "@swemock/shared";
import { AiSettings } from "@/components/ai/ai-settings";

export function SettingsForm({ initial }: { initial: Settings }) {
  return (
    <section aria-labelledby="ai-heading" className="space-y-3">
      <h2 id="ai-heading" className="text-lg font-semibold">
        AI
      </h2>
      <p className="text-muted-foreground text-sm">
        Every feature works without a provider: you get a scripted interviewer and copy-prompt packets you can paste into any chatbot.
        Nothing leaves this machine unless you configure a hosted provider or copy a packet yourself.
      </p>
      <AiSettings initial={initial} />
    </section>
  );
}
