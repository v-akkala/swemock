"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language, LldCategory } from "@swemock/shared";
import { CodeEditor } from "@/components/code-editor-lazy";
import { ApproachCheck, HintLadder, difficultyColor } from "@/components/dsa/workspace";
import { Markdown } from "@/components/markdown";
import { SplitPane } from "@/components/split-pane";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { LldFileRunResponse, LldRevealPayload, LldRunResponse } from "@/lib/lld-types";
import { cn } from "@/lib/utils";
import { DesignView } from "./design-view";

export interface LldWorkspaceLanguage {
  id: Language;
  label: string;
  monaco: string;
  files: { path: string; role: "provided" | "solution"; content: string; draft: string | null }[];
  visibleTests: Record<string, string>;
}

export interface LldWorkspaceProps {
  slug: string;
  title: string;
  difficulty: string;
  tags: string[];
  format: "system" | "class";
  specMd: string;
  languages: LldWorkspaceLanguage[];
  mode: "practice" | "interview";
  sessionId: string | null;
  solved: boolean;
  hintCount: number;
  initialHints: { level: number; text: string }[];
  initialReveal: LldRevealPayload | null;
  /** The requirement change, if it was already introduced in this session. */
  initialChange: string | null;
  /** A model is configured: approach checks run live instead of via a copy-prompt packet. */
  aiConnected?: boolean;
  /** Interview: the requirement change as soon as the interviewer introduced it. */
  externalChange?: string | null;
}

const AUTOSAVE_MS = 5000;
type LeftTab = "spec" | "approach" | "change" | "hints" | "design";
const CATEGORY_LABEL: Record<LldCategory, string> = { core: "Core", edge: "Edge cases", extension: "Extension" };

export function LldWorkspace(props: LldWorkspaceProps) {
  const { slug, mode, languages } = props;
  const [language, setLanguage] = useState<Language>(languages[0]!.id);
  const [files, setFiles] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(languages.map((l) => [l.id, Object.fromEntries(l.files.map((f) => [f.path, f.draft ?? f.content]))])),
  );
  const [active, setActive] = useState<string>(languages[0]!.files[0]!.path);
  const [sessionId, setSessionId] = useState<string | null>(props.sessionId);
  const [solved, setSolved] = useState(props.solved);
  const [busy, setBusy] = useState<"run" | "submit" | "file" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LldRunResponse | null>(null);
  const [output, setOutput] = useState<LldFileRunResponse | null>(null);
  const [consoleTab, setConsoleTab] = useState<"results" | "output">("results");
  const [leftTab, setLeftTab] = useState<LeftTab>(props.initialChange ? "change" : "spec");
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const [hints, setHints] = useState(props.initialHints);
  const [reveal, setReveal] = useState(props.initialReveal);
  const [localChange, setChange] = useState(props.initialChange);
  const change = localChange ?? props.externalChange ?? null;

  const dirty = useRef(new Set<Language>());
  const busyRef = useRef(false);
  const sessionRef = useRef(sessionId);
  const filesRef = useRef(files);
  useEffect(() => {
    sessionRef.current = sessionId;
    filesRef.current = files;
  });

  const lang = languages.find((l) => l.id === language)!;
  // The tab being viewed may belong to the other language after a switch.
  const activePath = lang.files.some((f) => f.path === active) || active in lang.visibleTests ? active : lang.files[0]!.path;
  const isTest = activePath in lang.visibleTests;

  const flush = useCallback(
    async (keepalive = false) => {
      const pending = [...dirty.current];
      if (!pending.length) return;
      dirty.current.clear();
      setSaved("saving");
      try {
        await Promise.all(
          pending.map((l) =>
            fetch(`/api/lld/${slug}/draft`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ language: l, files: filesRef.current[l], sessionId: sessionRef.current ?? undefined }),
              keepalive,
            }).then((r) => {
              if (!r.ok) throw new Error(String(r.status));
            }),
          ),
        );
        setSaved("saved");
      } catch {
        pending.forEach((l) => dirty.current.add(l));
        setSaved("error");
      }
    },
    [slug],
  );

  useEffect(() => {
    const id = setInterval(() => void flush(), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      void flush(true);
    };
  }, [flush]);

  function onChange(value: string) {
    if (isTest) return;
    setFiles((f) => ({ ...f, [language]: { ...f[language]!, [activePath]: value } }));
    dirty.current.add(language);
    if (saved !== "saving") setSaved("saving");
  }

  function switchLanguage(next: Language) {
    void flush();
    setLanguage(next);
    setActive(languages.find((l) => l.id === next)!.files[0]!.path);
  }

  const execute = useCallback(
    async (kind: "run" | "submit") => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(kind);
      setError(null);
      setConsoleTab("results");
      try {
        await flush();
        const res = await api<LldRunResponse>(`/api/lld/${slug}/${kind}`, "POST", {
          language,
          files: filesRef.current[language],
          sessionId: sessionRef.current ?? undefined,
        });
        setResult(res);
        setSessionId(res.sessionId);
        if (res.solved) setSolved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [slug, language, flush],
  );

  async function runFile() {
    if (busyRef.current || isTest) return;
    busyRef.current = true;
    setBusy("file");
    setError(null);
    setConsoleTab("output");
    try {
      await flush();
      const res = await api<LldFileRunResponse>(`/api/lld/${slug}/runfile`, "POST", {
        language,
        files: filesRef.current[language],
        path: activePath,
        sessionId: sessionRef.current ?? undefined,
      });
      setOutput(res);
      setSessionId(res.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void execute(e.shiftKey ? "submit" : "run");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute]);

  async function revealHint(level: number) {
    setError(null);
    try {
      const res = await api<{ sessionId: string; text: string }>(`/api/lld/${slug}/hint`, "POST", { level, sessionId: sessionRef.current ?? undefined });
      setSessionId(res.sessionId);
      setHints((h) => (h.some((x) => x.level === level) ? h : [...h, { level, text: res.text }].sort((a, b) => a.level - b.level)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function showDesign() {
    setError(null);
    try {
      const res = await api<LldRevealPayload & { sessionId: string }>(`/api/lld/${slug}/design`, "POST", { sessionId: sessionRef.current ?? undefined });
      setSessionId(res.sessionId);
      setReveal(res);
      setLeftTab("design");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function giveUp() {
    if (!window.confirm("Give up and show the reference? This problem will be scheduled for review.")) return;
    setError(null);
    try {
      setReveal(await api<LldRevealPayload>(`/api/lld/${slug}/giveup`, "POST", { sessionId: sessionRef.current ?? undefined }));
      setSessionId(null);
      setLeftTab("design");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function showChange() {
    if (!window.confirm("Show the requirement change? Submitting will then include its extension tests.")) return;
    setError(null);
    try {
      const res = await api<{ sessionId: string; changeMd: string }>(`/api/lld/${slug}/change`, "POST", { sessionId: sessionRef.current ?? undefined });
      setSessionId(res.sessionId);
      setChange(res.changeMd);
      setLeftTab("change");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const canSeeDesign = hints.length >= props.hintCount || solved;
  const tabs: LeftTab[] = ["spec", ...(mode === "practice" ? (["approach"] as LeftTab[]) : []), ...(change ? (["change"] as LeftTab[]) : []), "hints", ...(reveal ? (["design"] as LeftTab[]) : [])];

  const left = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Problem">
      <div role="tablist" aria-label="Problem sections" className="border-border flex shrink-0 gap-1 border-b px-2 pt-1">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={leftTab === t}
            onClick={() => setLeftTab(t)}
            className={cn("rounded-t-md px-3 py-1.5 text-sm capitalize", leftTab === t ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "change" ? "new requirement" : t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {leftTab === "spec" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{props.title}</h1>
              <span className={cn("rounded-full border border-border px-2 py-0.5 text-xs capitalize", difficultyColor(props.difficulty))}>{props.difficulty}</span>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs">{props.format === "system" ? "Complete the system" : "Implement the class"}</span>
              {solved && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400" data-testid="solved-badge">
                  ✓ Solved
                </span>
              )}
            </div>
            <div className="text-muted-foreground mb-3 flex flex-wrap gap-1.5 text-xs">
              {props.tags.map((t) => (
                <span key={t} className="bg-muted rounded px-1.5 py-0.5">
                  {t}
                </span>
              ))}
            </div>
            <Markdown>{props.specMd}</Markdown>
            {mode === "practice" && !change && (
              <div className="border-border mt-6 border-t pt-3">
                <p className="text-muted-foreground mb-2 text-xs">In an interview the interviewer adds a new requirement about 60% of the way in. You can try it here once you have a working design.</p>
                <Button variant="outline" onClick={() => void showChange()} data-testid="show-change">
                  Show a requirement change
                </Button>
              </div>
            )}
          </>
        )}
        {leftTab === "approach" && mode === "practice" && (
          <ApproachCheck slug={slug} itemType="lld" sessionId={sessionId} aiConnected={Boolean(props.aiConnected)} onSession={setSessionId} />
        )}
        {leftTab === "change" && change && (
          <div data-testid="change-text">
            <h2 className="mb-2 text-lg font-semibold">New requirement</h2>
            <Markdown>{change}</Markdown>
            <p className="text-muted-foreground mt-3 text-xs">Submit now includes the extension tests for this change.</p>
          </div>
        )}
        {leftTab === "hints" && (
          <HintLadder
            interview={mode === "interview"}
            hintCount={props.hintCount}
            hints={hints}
            canSeeEditorial={canSeeDesign}
            editorialShown={Boolean(reveal)}
            onHint={revealHint}
            onEditorial={showDesign}
            onGiveUp={giveUp}
          />
        )}
        {leftTab === "design" && reveal && <DesignView reveal={reveal} languages={languages} />}
      </div>
    </section>
  );

  const shown = isTest ? lang.visibleTests[activePath]! : files[language]![activePath]!;

  const right = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Code">
      <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <select aria-label="Language" value={language} onChange={(e) => switchLanguage(e.target.value as Language)} className="bg-background rounded-md border border-border px-2 py-1 text-sm">
          {languages.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-xs" aria-live="polite" data-testid="save-status">
          {saved === "saved" ? "Saved" : saved === "saving" ? "Saving…" : "Couldn't save"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => void runFile()} disabled={busy !== null || isTest} data-testid="run-file" title="Run the current file as a program">
            {busy === "file" ? "Running…" : "Run file"}
          </Button>
          <Button variant="outline" onClick={() => void execute("run")} disabled={busy !== null} data-testid="run-button" title="Ctrl/Cmd+Enter">
            {busy === "run" ? "Running…" : "Run tests"}
          </Button>
          <Button onClick={() => void execute("submit")} disabled={busy !== null} data-testid="submit-button" title="Ctrl/Cmd+Shift+Enter">
            {busy === "submit" ? "Judging…" : "Submit"}
          </Button>
        </div>
      </div>
      <div role="tablist" aria-label="Files" className="border-border flex shrink-0 gap-1 overflow-x-auto border-b px-2 pt-1" data-testid="file-tabs">
        {lang.files.map((f) => {
          const edited = files[language]![f.path] !== f.content;
          return (
            <button
              key={f.path}
              role="tab"
              aria-selected={activePath === f.path}
              onClick={() => setActive(f.path)}
              className={cn("rounded-t-md px-3 py-1.5 font-mono text-xs", activePath === f.path ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
              data-testid={`file-${f.path}`}
            >
              {f.path}
              {f.role === "provided" && <span className="text-muted-foreground ml-1 font-sans">provided{edited ? ", edited" : ""}</span>}
              {f.role === "solution" && <span className="text-muted-foreground ml-1 font-sans">yours</span>}
            </button>
          );
        })}
        {Object.keys(lang.visibleTests).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={activePath === p}
            onClick={() => setActive(p)}
            className={cn("rounded-t-md px-3 py-1.5 font-mono text-xs", activePath === p ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {p.replace(/^tests\/visible\//, "")}
            <span className="text-muted-foreground ml-1 font-sans">read-only</span>
          </button>
        ))}
      </div>
      <SplitPane
        direction="column"
        initial={62}
        className="min-h-0 flex-1"
        first={<CodeEditor key={`${language}:${activePath}`} label={`${language}:${activePath}`} language={lang.monaco} value={shown} onChange={onChange} readOnly={isTest} onRun={() => void execute("run")} onSubmit={() => void execute("submit")} />}
        second={
          <div className="flex h-full min-h-0 flex-col">
            <div role="tablist" aria-label="Console" className="border-border flex shrink-0 gap-1 border-b px-2 pt-1">
              {(["results", "output"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={consoleTab === t}
                  onClick={() => setConsoleTab(t)}
                  className={cn("rounded-t-md px-3 py-1.5 text-sm capitalize", consoleTab === t ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
              {error && (
                <p role="alert" className="mb-2 text-red-600 dark:text-red-400" data-testid="error">
                  {error}
                </p>
              )}
              {consoleTab === "results" ? <Results result={result} /> : <Output output={output} />}
            </div>
          </div>
        }
      />
    </section>
  );

  return <SplitPane first={left} second={right} initial={36} min={20} max={60} className="h-full" />;
}

function Results({ result }: { result: LldRunResponse | null }) {
  if (!result) return <p className="text-muted-foreground">Run the visible tests any time; Submit also runs the hidden ones.</p>;
  return (
    <div className="space-y-3" data-testid="lld-results">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn("text-base font-semibold", result.solved ? "text-emerald-600 dark:text-emerald-400" : result.buildError || result.timedOut ? "text-red-600 dark:text-red-400" : "")}
          data-testid="verdict"
        >
          {result.buildError
            ? "Build error"
            : result.timedOut
              ? "Timed out"
              : result.solved
                ? result.counts.extension.total > result.counts.extension.passed
                  ? "Core and edge tests passed"
                  : "All tests passed"
                : `${result.passed}/${result.total} passed`}
        </span>
        {result.kind === "submit" && (
          <ul className="flex flex-wrap gap-2 text-xs" data-testid="counts">
            {(["core", "edge", "extension"] as LldCategory[])
              .filter((c) => result.counts[c].total > 0)
              .map((c) => (
                <li key={c} className="bg-muted rounded px-2 py-0.5" data-testid={`count-${c}`}>
                  {CATEGORY_LABEL[c]}: {result.counts[c].passed}/{result.counts[c].total}
                </li>
              ))}
          </ul>
        )}
      </div>
      {Object.entries(result.edits).map(([path, s]) => (
        <p key={path} className="text-xs text-amber-700 dark:text-amber-300" data-testid="edit-flag">
          You edited the provided file <span className="font-mono">{path}</span> (+{s.added} −{s.removed} lines). Edits to given code are tracked, and the design review looks at them.
        </p>
      ))}
      {result.buildError && <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">{result.buildError}</pre>}
      <ul className="space-y-1" data-testid="test-list">
        {result.tests.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={cn("mt-0.5 text-xs", t.status === "passed" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{t.status === "passed" ? "✓" : "✗"}</span>
            <span className="flex-1">
              <span className="font-mono text-xs">{t.label}</span>
              <span className="text-muted-foreground ml-2 text-xs">{t.hidden ? `hidden · ${t.category}` : t.category}</span>
              {t.status !== "passed" && t.message && <pre className="bg-muted mt-1 max-h-40 overflow-auto rounded p-2 font-mono text-xs whitespace-pre-wrap">{t.message}</pre>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Output({ output }: { output: LldFileRunResponse | null }) {
  if (!output) return <p className="text-muted-foreground">&ldquo;Run file&rdquo; runs the file you are viewing as a program and shows its output here.</p>;
  return (
    <div className="space-y-2" data-testid="file-output">
      <p className="text-xs">
        {output.timedOut ? "Timed out." : `Exit code ${output.exitCode ?? "?"}.`}
      </p>
      {output.stdout && <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">{output.stdout}</pre>}
      {output.stderr && <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap text-red-700 dark:text-red-300">{output.stderr}</pre>}
    </div>
  );
}
