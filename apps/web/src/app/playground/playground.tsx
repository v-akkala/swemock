"use client";

import { useState } from "react";
import { VERDICT_LABELS, type DsaRunResult, type Language, type ProjectRunResult, type Verdict } from "@swemock/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LanguageOption {
  id: Language;
  label: string;
  stub: string;
  hello: string;
}

type Mode = "program" | "problem";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

function verdictClass(v: Verdict): string {
  if (v === "accepted") return "text-emerald-600 dark:text-emerald-400";
  if (v === "ran" || v === "skipped") return "text-muted-foreground";
  return "text-red-600 dark:text-red-400";
}

export function Playground({
  languages,
  sample,
}: {
  languages: LanguageOption[];
  sample: { title: string; statement: string; tests: number };
}) {
  const [mode, setMode] = useState<Mode>("problem");
  const [language, setLanguage] = useState<Language>(languages[0]!.id);
  const [code, setCode] = useState<Record<string, string>>({});
  const [stdin, setStdin] = useState("world");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dsaResult, setDsaResult] = useState<DsaRunResult | null>(null);
  const [runResult, setRunResult] = useState<ProjectRunResult | null>(null);

  const lang = languages.find((l) => l.id === language)!;
  const key = `${mode}:${language}`;
  const source = code[key] ?? (mode === "problem" ? lang.stub : lang.hello);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "problem") setDsaResult(await post<DsaRunResult>("/api/playground/dsa", { language, code: source }));
      else setRunResult(await post<ProjectRunResult>("/api/playground/run", { language, code: source, stdin }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Playground mode" className="inline-flex rounded-md border border-border p-0.5">
          {(["problem", "program"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn("rounded px-3 py-1 text-sm", mode === m ? "bg-muted font-medium" : "text-muted-foreground")}
            >
              {m === "problem" ? "Sample problem" : "Run a program"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="bg-background rounded-md border border-border px-2 py-1"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={run} disabled={busy}>
          {busy ? "Running…" : mode === "problem" ? `Submit (${sample.tests} tests)` : "Run"}
        </Button>
      </div>

      {mode === "problem" && (
        <p className="text-sm">
          <strong>{sample.title}.</strong> {sample.statement}
        </p>
      )}

      <textarea
        aria-label="Code"
        spellCheck={false}
        value={source}
        onChange={(e) => setCode({ ...code, [key]: e.target.value })}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void run();
          }
        }}
        className="bg-card h-72 w-full rounded-md border border-border p-3 font-mono text-sm"
      />

      {mode === "program" && (
        <label className="block text-sm">
          Standard input
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            className="bg-card mt-1 h-16 w-full rounded-md border border-border p-2 font-mono text-sm"
          />
        </label>
      )}

      <div aria-live="polite">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {mode === "problem" && dsaResult && !error && <DsaResultView result={dsaResult} />}
        {mode === "program" && runResult && !error && <RunResultView result={runResult} />}
      </div>
    </div>
  );
}

function DsaResultView({ result }: { result: DsaRunResult }) {
  return (
    <div className="space-y-3">
      <p className={cn("text-lg font-semibold", verdictClass(result.verdict))}>
        {VERDICT_LABELS[result.verdict]}
        <span className="text-muted-foreground ml-3 text-sm font-normal">
          {result.passed}/{result.total} passed
          {result.maxTimeMs !== null && ` · max ${result.maxTimeMs.toFixed(2)} ms`}
          {result.maxMemoryKb !== null && ` · max ${(result.maxMemoryKb / 1024).toFixed(1)} MB`}
        </span>
      </p>
      {result.compileOutput && <pre className="bg-card overflow-auto rounded-md border border-border p-3 text-xs">{result.compileOutput}</pre>}
      {result.tests.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1">Test</th>
              <th>Verdict</th>
              <th>Time</th>
              <th>Memory</th>
              <th>Output / message</th>
            </tr>
          </thead>
          <tbody>
            {result.tests.map((t) => (
              <tr key={t.id} className="border-t border-border align-top">
                <td className="py-1">#{t.id}</td>
                <td className={verdictClass(t.verdict)}>{VERDICT_LABELS[t.verdict]}</td>
                <td>{t.timeMs === null ? "—" : `${t.timeMs.toFixed(2)} ms`}</td>
                <td>{t.memoryKb === null ? "—" : `${(t.memoryKb / 1024).toFixed(1)} MB`}</td>
                <td className="font-mono text-xs whitespace-pre-wrap">
                  {[t.actual, t.message, t.stdout && `stdout: ${t.stdout}`, t.stderr && `stderr: ${t.stderr}`].filter(Boolean).join("\n")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RunResultView({ result }: { result: ProjectRunResult }) {
  const status = result.timedOut
    ? "Timed out"
    : result.oomKilled
      ? "Out of memory"
      : `Exited with code ${result.exitCode}`;
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>{status}</strong> <span className="text-muted-foreground">in {Math.round(result.durationMs)} ms</span>
      </p>
      <pre className="bg-card overflow-auto rounded-md border border-border p-3 text-xs">{result.stdout || "(no output)"}</pre>
      {result.stderr && (
        <pre className="overflow-auto rounded-md border border-red-500/40 p-3 text-xs text-red-600 dark:text-red-400">{result.stderr}</pre>
      )}
    </div>
  );
}
