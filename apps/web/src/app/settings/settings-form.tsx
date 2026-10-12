"use client";

import { useState } from "react";
import type { Provider, Settings } from "@swemock/shared";
import { patchSettings } from "@/lib/api";

const PROVIDER_OPTIONS: { value: Provider; label: string; detail: string; available: boolean }[] = [
  { value: "none", label: "None", detail: "Free. Scripted interviewer, copy-prompt packets, self-scoring.", available: true },
  { value: "ollama", label: "Ollama", detail: "Free local models. Available in M3.", available: false },
  { value: "openai-compatible", label: "OpenAI-compatible", detail: "Any chat-completions endpoint. Available in M3.", available: false },
  { value: "anthropic", label: "Anthropic", detail: "Your own API key, pay-per-use. Available in M3.", available: false },
];

export function SettingsForm({ initial }: { initial: Settings }) {
  const [provider, setProvider] = useState<Provider>(initial.provider);
  const [status, setStatus] = useState<string>("");

  async function choose(value: Provider) {
    setProvider(value);
    setStatus("Saving…");
    try {
      await patchSettings({ provider: value });
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Saving failed.");
    }
  }

  return (
    <section aria-labelledby="ai-heading" className="space-y-3">
      <h2 id="ai-heading" className="text-lg font-semibold">
        AI provider
      </h2>
      <p className="text-muted-foreground text-sm">Every feature works with no provider configured.</p>
      <fieldset className="space-y-2">
        <legend className="sr-only">Provider</legend>
        {PROVIDER_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name="provider"
              value={opt.value}
              checked={provider === opt.value}
              disabled={!opt.available}
              onChange={() => choose(opt.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">{opt.label}</span>
              <span className="text-muted-foreground block text-xs">{opt.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p role="status" aria-live="polite" className="text-muted-foreground h-5 text-sm">
        {status}
      </p>
    </section>
  );
}
