"use client";

import { useEffect, useState } from "react";
import { MODEL_ROLES, type ModelRole, type Provider, type RoleModels, type Settings } from "@swemock/shared";
import { Button } from "@/components/ui/button";
import { api, patchSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface AiStatus {
  provider: Provider;
  models: RoleModels;
  connected: boolean;
  problem: string | null;
  envOverrides: string[];
  keys: { anthropic: string | null; "openai-compatible": string | null };
  defaults: Record<"anthropic" | "ollama" | "openai-compatible", RoleModels>;
  fakeEnabled: boolean;
}

const OPTIONS: { value: Provider; label: string; cost: string; detail: string }[] = [
  { value: "none", label: "No AI", cost: "Free", detail: "Scripted interviewer, copy-prompt packets for any chatbot, and self-scoring." },
  { value: "ollama", label: "Ollama", cost: "Free", detail: "Local models on your machine. Needs the Ollama app and enough RAM (see below)." },
  { value: "openai-compatible", label: "OpenAI-compatible", cost: "Varies", detail: "Any endpoint with OpenAI's chat-completions API: OpenAI, OpenRouter, vLLM, LM Studio…" },
  { value: "anthropic", label: "Anthropic", cost: "Pay per use", detail: "Claude with your own API key, billed to your Anthropic account." },
];

const ROLE_HELP: Record<ModelRole, string> = {
  interviewer: "Live interviewer",
  assistant: "AI assistant (AI Fluency rounds)",
  grader: "Grading after a round",
  fast: "Short replies (approach checks)",
};

/** Provider choice, keys, models per role, and Test connection. Used by Settings and first-run setup. */
export function AiSettings({ initial, onSaved }: { initial: Settings; onSaved?: (s: Settings) => void }) {
  const [settings, setSettings] = useState(initial);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api<AiStatus>("/api/ai/status", "GET").then(setStatus).catch(() => undefined);
  useEffect(() => {
    void refresh();
  }, []);

  const provider = settings.provider;
  const options = status?.fakeEnabled ? [...OPTIONS, { value: "fake" as Provider, label: "Fake (tests)", cost: "Free", detail: "Deterministic test provider." }] : OPTIONS;

  async function save(patch: Partial<Settings>) {
    setBusy(true);
    setMessage(null);
    setTest(null);
    try {
      const next = await patchSettings(patch);
      setSettings(next);
      onSaved?.(next);
      await refresh();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveKey() {
    if (provider !== "anthropic" && provider !== "openai-compatible") return;
    setBusy(true);
    try {
      await api("/api/ai/key", "PUT", { provider, apiKey: key });
      setKey("");
      await refresh();
      setMessage("Key saved (encrypted on this machine).");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setBusy(true);
    setTest(null);
    try {
      setTest(await api<{ ok: boolean; detail: string }>("/api/ai/test", "POST", {}));
    } catch (e) {
      setTest({ ok: false, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function setModel(role: ModelRole, value: string) {
    if (provider === "none" || provider === "fake") return;
    setSettings((s) => ({ ...s, models: { ...s.models, [provider]: { ...s.models[provider], [role]: value } } }));
  }

  return (
    <div className="space-y-4" data-testid="ai-settings">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">AI provider</legend>
        {options.map((o) => (
          <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-md border border-border p-3", provider === o.value && "bg-muted")}>
            <input type="radio" name="provider" value={o.value} checked={provider === o.value} onChange={() => void save({ provider: o.value })} className="mt-1" />
            <span>
              <span className="block text-sm font-medium">
                {o.label} <span className="text-muted-foreground font-normal">· {o.cost}</span>
              </span>
              <span className="text-muted-foreground block text-xs">{o.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {status && status.envOverrides.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Overridden by environment variables: {status.envOverrides.join(", ")}.</p>
      )}

      {provider === "ollama" && (
        <div className="space-y-2 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Ollama URL</span>
            <input
              value={settings.ollamaBaseUrl}
              onChange={(e) => setSettings({ ...settings, ollamaBaseUrl: e.target.value })}
              className="bg-background w-full rounded-md border border-border px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <p className="text-muted-foreground text-xs">
            On macOS use the native Ollama app (Docker can&apos;t use the Mac GPU); the default URL reaches it from the container. The default
            models need about 8 GB of free RAM (<code>qwen3.5:9b</code>) and 4 GB (<code>qwen3.5:4b</code>); pull them with{" "}
            <code>ollama pull qwen3.5:9b</code> and <code>ollama pull qwen3.5:4b</code>.
          </p>
        </div>
      )}

      {provider === "openai-compatible" && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">Base URL (including /v1)</span>
          <input
            value={settings.openaiCompatibleBaseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(e) => setSettings({ ...settings, openaiCompatibleBaseUrl: e.target.value })}
            className="bg-background w-full rounded-md border border-border px-2 py-1.5 font-mono text-xs"
          />
        </label>
      )}

      {(provider === "anthropic" || provider === "openai-compatible") && (
        <div className="space-y-1 text-sm">
          <span className="block text-xs font-medium">API key</span>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={status?.keys[provider] ?? (provider === "anthropic" ? "sk-ant-…" : "Optional for local gateways")}
              aria-label="API key"
              autoComplete="off"
              className="bg-background flex-1 rounded-md border border-border px-2 py-1.5 font-mono text-xs"
            />
            <Button variant="outline" onClick={saveKey} disabled={busy || key.trim().length < 8}>
              Save key
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {status?.keys[provider] ? `Stored: ${status.keys[provider]}. ` : ""}Encrypted on this machine and never shown again.
          </p>
        </div>
      )}

      {provider !== "none" && provider !== "fake" && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Models</p>
          {MODEL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-56">{ROLE_HELP[role]}</span>
              <input
                value={settings.models[provider][role]}
                placeholder={status?.defaults[provider][role] || "model name"}
                onChange={(e) => setModel(role, e.target.value)}
                aria-label={`${role} model`}
                className="bg-background flex-1 rounded-md border border-border px-2 py-1 font-mono"
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-56">Token cap per session (0 = none)</span>
            <input
              type="number"
              min={0}
              value={settings.sessionTokenCap}
              onChange={(e) => setSettings({ ...settings, sessionTokenCap: Math.max(0, Number(e.target.value) || 0) })}
              className="bg-background w-32 rounded-md border border-border px-2 py-1 font-mono"
            />
          </label>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void save({
                models: settings.models,
                ollamaBaseUrl: settings.ollamaBaseUrl,
                openaiCompatibleBaseUrl: settings.openaiCompatibleBaseUrl,
                sessionTokenCap: settings.sessionTokenCap,
              })
            }
          >
            Save settings
          </Button>
        </div>
      )}

      {provider !== "none" && (
        <div className="space-y-1">
          <Button onClick={runTest} disabled={busy} data-testid="test-connection">
            Test connection
          </Button>
          {status && !status.connected && status.problem && <p className="text-xs text-amber-600 dark:text-amber-400">{status.problem}</p>}
          {test && (
            <p role="status" className={cn("text-xs", test.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")} data-testid="test-result">
              {test.detail}
            </p>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-muted-foreground text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
