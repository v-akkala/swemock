"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComprehensionPublic, ExtensionPublic, ReviewPublic } from "@swemock/content";
import { CodeEditor } from "@/components/code-editor-lazy";
import { Markdown } from "@/components/markdown";
import { SplitPane } from "@/components/split-pane";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { CommandResult, FindingView, FluencyType, SubmitResult } from "@/lib/fluency-types";
import { cn } from "@/lib/utils";
import { AssistantPanel, type ContextItem } from "./assistant-panel";
import { FindingsPanel, type Draft, type FindingFields } from "./findings-panel";
import { PrView } from "./pr-view";

type Pub = ComprehensionPublic | ReviewPublic | ExtensionPublic;

export interface FluencyWorkspaceProps {
  type: FluencyType;
  slug: string;
  pub: Pub;
  /** Saved files from an earlier visit; null starts from the exercise's files. */
  drafts: Record<string, string> | null;
  startFiles: Record<string, string>;
  sessionId: string | null;
  mode: "practice" | "interview";
  aiConnected: boolean;
  initialFindings: FindingView[];
  initialSummary: string;
  initialDecision: { value: string; summary: string } | null;
}

const AUTOSAVE_MS = 5000;
type LeftTab = "brief" | "findings" | "summary" | "ticket";

const monacoLanguage = (path: string) => (/\.(cpp|hpp|h|cc)$/.test(path) ? "cpp" : /\.py$/.test(path) ? "python" : "plaintext");

export function FluencyWorkspace(props: FluencyWorkspaceProps) {
  const router = useRouter();
  const { type, slug, pub } = props;
  const [files, setFiles] = useState<Record<string, string>>(() => ({ ...props.startFiles, ...(props.drafts ?? {}) }));
  const paths = Object.keys(files).sort();
  const first = type === "extension" ? (paths.find((p) => p === "CONVENTIONS.md") ?? paths[0]!) : (paths.find((p) => !p.startsWith("tests/")) ?? paths[0]!);
  const [open, setOpen] = useState<string[]>([first]);
  const [active, setActive] = useState(first);
  const [view, setView] = useState<"pr" | "editor">(type === "review" ? "pr" : "editor");
  const [leftTab, setLeftTab] = useState<LeftTab>(type === "extension" ? "ticket" : type === "comprehension" ? "brief" : "findings");
  const [sessionId, setSessionId] = useState<string | null>(props.sessionId);
  const [findings, setFindings] = useState(props.initialFindings);
  const [summary, setSummary] = useState(props.initialSummary);
  const [decision, setDecision] = useState(props.initialDecision);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number; text: string } | null>(null);
  const [context, setContext] = useState<ContextItem[]>([]);
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [console_, setConsole] = useState<"output" | "tests">("output");

  const dirty = useRef(false);
  const filesRef = useRef(files);
  const sessionRef = useRef(sessionId);
  useEffect(() => {
    filesRef.current = files;
    sessionRef.current = sessionId;
  });
  const base = `/api/fluency/${type}/${slug}`;

  const flush = useCallback(
    async (keepalive = false) => {
      if (!dirty.current) return;
      dirty.current = false;
      setSaved("saving");
      try {
        const res = await fetch(`${base}/draft`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: filesRef.current, sessionId: sessionRef.current ?? undefined }),
          keepalive,
        });
        if (!res.ok) throw new Error(String(res.status));
        setSaved("saved");
      } catch {
        dirty.current = true;
        setSaved("error");
      }
    },
    [base],
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
    setFiles((f) => ({ ...f, [active]: value }));
    dirty.current = true;
    if (saved !== "saving") setSaved("saving");
  }

  function openFile(path: string) {
    setOpen((o) => (o.includes(path) ? o : [...o, path]));
    setActive(path);
    setView("editor");
  }

  function closeTab(path: string) {
    const rest = open.filter((p) => p !== path);
    setOpen(rest.length ? rest : [first]);
    if (active === path) setActive(rest.at(-1) ?? first);
  }

  function newFile() {
    const name = window.prompt(type === "extension" ? "New file path (for example tests/test_mine.py or src/helpers.py)" : "New test file (for example tests/test_mine.py)", "tests/test_mine.py");
    if (!name?.trim()) return;
    if (!/^[\w-]+(\/[\w.-]+)*\.(py|cpp|hpp|h|md|txt|json)$/.test(name.trim()) || name.startsWith("tests/hidden")) return setError("That isn't a valid new file path.");
    setFiles((f) => (name in f ? f : { ...f, [name.trim()]: "" }));
    dirty.current = true;
    openFile(name.trim());
  }

  async function exec(commandId: string) {
    if (busy) return;
    setBusy(commandId);
    setError(null);
    try {
      await flush();
      const res = await api<CommandResult>(`${base}/run`, "POST", { commandId, files: filesRef.current, sessionId: sessionRef.current ?? undefined });
      setResult(res);
      setSubmitResult(null);
      setSessionId(res.sessionId);
      setConsole(res.tests ? "tests" : "output");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy("submit");
    setError(null);
    try {
      await flush();
      const res = await api<SubmitResult>(`${base}/submit`, "POST", { files: filesRef.current, sessionId: sessionRef.current ?? undefined });
      setSubmitResult(res);
      setSessionId(res.sessionId);
      setConsole("tests");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveFinding(f: FindingFields) {
    try {
      const res = await api<{ sessionId: string; finding: FindingView }>(`${base}/finding`, "POST", { finding: { ...f, lines: f.lines }, sessionId: sessionRef.current ?? undefined });
      setSessionId(res.sessionId);
      setFindings((all) => [...all, res.finding]);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeFinding(id: string) {
    await api(`${base}/finding`, "DELETE", { id, sessionId: sessionRef.current ?? undefined });
    setFindings((all) => all.filter((f) => f.id !== id));
  }

  function jump(f: FindingView) {
    openFile(f.file);
    setReveal({ line: f.lines[0], nonce: Date.now() });
  }

  async function saveSummary(text: string) {
    setSummary(text);
    const res = await api<{ sessionId: string }>(`${base}/summary`, "PUT", { text, sessionId: sessionRef.current ?? undefined }).catch(() => null);
    if (res) setSessionId(res.sessionId);
  }

  const onApply = (path: string, newText: string, proposalId: string, accepted: string[]) => {
    setFiles((f) => ({ ...f, [path]: newText }));
    dirty.current = true;
    if (accepted.length) openFile(path);
  };

  async function finish() {
    if (!window.confirm("Finish this attempt and see the results?")) return;
    await flush();
    const res = await api<{ sessionId: string }>(`${base}/finish`, "POST", { sessionId: sessionRef.current ?? undefined }).catch((e: Error) => {
      setError(e.message);
      return null;
    });
    if (res) router.push(`/debrief/${res.sessionId}`);
  }

  const annotates = type !== "extension";
  const here = findings.filter((f) => f.file === active);
  const tests = submitResult ? submitResult.tests : (result?.tests ?? null);
  const attach = () => {
    const item: ContextItem = selection && selection.text ? { path: active, from: selection.from, to: selection.to } : { path: active };
    setContext((c) => (c.some((x) => x.path === item.path && x.from === item.from && x.to === item.to) ? c : [...c, item]));
  };

  const left = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Exercise">
      <div role="tablist" aria-label="Exercise sections" className="border-border flex shrink-0 gap-1 border-b px-2 pt-1">
        {(type === "comprehension" ? (["brief", "findings", "summary"] as LeftTab[]) : type === "review" ? (["findings"] as LeftTab[]) : (["ticket"] as LeftTab[])).map((t) => (
          <button key={t} role="tab" aria-selected={leftTab === t} onClick={() => setLeftTab(t)} className={cn("rounded-t-md px-3 py-1.5 text-sm capitalize", leftTab === t ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
            {t === "findings" ? (type === "review" ? "comments" : "findings") : t}
            {t === "findings" && findings.length > 0 ? ` (${findings.length})` : ""}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {leftTab === "brief" && type === "comprehension" && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">{pub.title}</h1>
            <Markdown>{(pub as ComprehensionPublic).brief}</Markdown>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-xs">
              <li>Write a short summary of what the system does.</li>
              <li>Find the bugs ({(pub as ComprehensionPublic).bugCount}-ish) and mark them in the editor with a category and severity.</li>
              <li>Be ready to discuss the design decisions.</li>
              <li>Propose an improvement, and implement one if there is time.</li>
            </ol>
          </div>
        )}
        {leftTab === "summary" && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">What does this system do?</span>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={(e) => void saveSummary(e.target.value)} className="bg-card h-64 w-full rounded-md border border-border p-2" placeholder="Purpose, main pieces, how data flows, where it is fragile." data-testid="summary" />
          </label>
        )}
        {leftTab === "findings" && (
          <FindingsPanel findings={findings} draft={draft} onDraft={setDraft} onSave={saveFinding} onRemove={(id) => void removeFinding(id)} onJump={jump} noun={type === "review" ? "comment" : "finding"} />
        )}
        {leftTab === "ticket" && type === "extension" && (
          <div className="space-y-3" data-testid="ticket">
            <Markdown>{(pub as ExtensionPublic).ticketMd}</Markdown>
            <p className="text-muted-foreground text-xs">
              Follow <button className="underline" onClick={() => openFile("CONVENTIONS.md")}>CONVENTIONS.md</button>: structure and style count as much as passing tests. Use the assistant if you like, and check what it gives you.
            </p>
          </div>
        )}
      </div>
    </section>
  );

  const editor = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Editor">
      <div className="border-border flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1">
        {type === "review" && (
          <div className="flex gap-1" role="group" aria-label="View">
            {(["pr", "editor"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={cn("rounded-md border border-border px-2 py-0.5 text-xs", view === v && "bg-muted font-medium")} data-testid={`view-${v}`}>
                {v === "pr" ? "Pull request" : "Editor"}
              </button>
            ))}
          </div>
        )}
        <span className="text-muted-foreground text-xs" aria-live="polite" data-testid="save-status">
          {saved === "saved" ? "Saved" : saved === "saving" ? "Saving…" : "Couldn't save"}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {pub.commands.map((c) => (
            <Button key={c.id} variant="outline" className="h-7 text-xs" onClick={() => void exec(c.id)} disabled={busy !== null} data-testid={`cmd-${c.id}`}>
              {busy === c.id ? "Running…" : c.label}
            </Button>
          ))}
          {type !== "comprehension" && (
            <Button className="h-7 text-xs" onClick={() => void submit()} disabled={busy !== null} data-testid="submit-button">
              {busy === "submit" ? "Judging…" : type === "review" ? "Check my fix" : "Submit"}
            </Button>
          )}
          {props.mode === "practice" && (
            <Button variant="ghost" className="h-7 text-xs" onClick={() => void finish()} data-testid="finish">
              Finish and see results
            </Button>
          )}
        </div>
      </div>
      {view === "pr" && type === "review" ? (
        <div className="min-h-0 flex-1">
          <PrView
            title={(pub as ReviewPublic).pr.title}
            description={(pub as ReviewPublic).pr.description}
            base={(pub as ReviewPublic).base}
            head={(pub as ReviewPublic).head}
            findings={findings}
            onComment={(file, line) => {
              setDraft({ file, from: line, to: line });
              setLeftTab("findings");
            }}
            onFix={() => setView("editor")}
            decision={decision}
            onDecide={async (value, text) => {
              const res = await api<{ sessionId: string }>(`${base}/decision`, "PUT", { value, summary: text, sessionId: sessionRef.current ?? undefined });
              setSessionId(res.sessionId);
              setDecision({ value, summary: text });
            }}
          />
        </div>
      ) : (
        <SplitPane
          direction="column"
          initial={66}
          className="min-h-0 flex-1"
          first={
            <div className="flex h-full min-h-0">
              <nav aria-label="Files" className="border-border w-44 shrink-0 overflow-auto border-r py-1 text-xs" data-testid="file-tree">
                {paths.map((p) => (
                  <button key={p} onClick={() => openFile(p)} className={cn("block w-full truncate px-2 py-0.5 text-left font-mono", active === p ? "bg-muted font-medium" : "hover:bg-muted/60")} title={p} data-testid={`tree-${p}`}>
                    {p}
                  </button>
                ))}
                <button onClick={newFile} className="text-muted-foreground mt-1 block w-full px-2 py-0.5 text-left hover:underline" data-testid="new-file">
                  + New file
                </button>
              </nav>
              <div className="flex min-w-0 flex-1 flex-col">
                <div role="tablist" aria-label="Open files" className="border-border flex shrink-0 gap-1 overflow-x-auto border-b px-1 pt-1">
                  {open.map((p) => (
                    <span key={p} className={cn("flex items-center gap-1 rounded-t-md px-2 py-1 font-mono text-xs", active === p ? "bg-muted font-medium" : "text-muted-foreground")}>
                      <button role="tab" aria-selected={active === p} onClick={() => setActive(p)} data-testid={`tab-${p}`}>
                        {p.split("/").at(-1)}
                      </button>
                      {open.length > 1 && (
                        <button aria-label={`Close ${p}`} onClick={() => closeTab(p)} className="text-muted-foreground hover:text-foreground">
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  <span className="ml-auto flex shrink-0 gap-1 pb-1 pr-1">
                    <Button variant="ghost" className="h-6 px-2 text-xs" onClick={attach} data-testid="add-context">
                      Add to context
                    </Button>
                    {annotates && (
                      <Button
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setDraft({ file: active, from: selection?.from ?? 1, to: selection?.to ?? selection?.from ?? 1 });
                          setLeftTab("findings");
                        }}
                        data-testid="add-finding"
                      >
                        Add {type === "review" ? "comment" : "finding"}
                      </Button>
                    )}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <CodeEditor
                    key={active}
                    label={`${pub.language}:${active}`}
                    language={monacoLanguage(active)}
                    value={files[active] ?? ""}
                    onChange={onChange}
                    marks={here.map((f) => ({ from: f.lines[0], to: f.lines[1], note: `${f.category} (${f.severity})${f.text ? `: ${f.text}` : ""}` }))}
                    onSelection={setSelection}
                    reveal={reveal}
                  />
                </div>
              </div>
            </div>
          }
          second={
            <div className="flex h-full min-h-0 flex-col">
              <div role="tablist" aria-label="Console" className="border-border flex shrink-0 gap-1 border-b px-2 pt-1">
                {(["output", "tests"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={console_ === t} onClick={() => setConsole(t)} className={cn("rounded-t-md px-3 py-1 text-xs capitalize", console_ === t ? "bg-muted font-medium" : "text-muted-foreground")}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
                {error && (
                  <p role="alert" className="mb-2 text-red-600 dark:text-red-400" data-testid="error">
                    {error}
                  </p>
                )}
                {console_ === "output" ? <Output result={result} /> : <TestList tests={tests} submit={submitResult} result={result} />}
              </div>
            </div>
          }
        />
      )}
    </section>
  );

  const assistant = (
    <AssistantPanel
      type={type}
      slug={slug}
      sessionId={sessionId}
      files={files}
      activePath={active}
      context={context}
      onContext={setContext}
      aiConnected={props.aiConnected}
      onSession={setSessionId}
      onApply={onApply}
    />
  );

  return <SplitPane first={left} second={<SplitPane first={editor} second={assistant} initial={68} min={40} max={85} className="h-full" />} initial={22} min={14} max={40} className="h-full" />;
}

function Output({ result }: { result: CommandResult | null }) {
  if (!result) return <p className="text-muted-foreground">Run a command to see its output here.</p>;
  return (
    <div className="space-y-1" data-testid="output">
      <p>{result.timedOut ? "Timed out." : `Exit code ${result.exitCode ?? "?"}.`}</p>
      {result.stdout && <pre className="bg-muted max-h-64 overflow-auto rounded p-2 font-mono whitespace-pre-wrap">{result.stdout}</pre>}
      {result.stderr && <pre className="bg-muted max-h-64 overflow-auto rounded p-2 font-mono whitespace-pre-wrap text-red-700 dark:text-red-300">{result.stderr}</pre>}
    </div>
  );
}

function TestList({ tests, submit, result }: { tests: CommandResult["tests"]; submit: SubmitResult | null; result: CommandResult | null }) {
  if (!tests) return <p className="text-muted-foreground">Run the tests, or submit, to see results here.</p>;
  return (
    <div className="space-y-2" data-testid="test-results">
      <p className="text-sm font-semibold" data-testid="verdict">
        {submit ? (submit.buildError ? "Build error" : submit.solved ? "All tests passed" : `${submit.passed}/${submit.total} passed`) : `${result?.passed ?? 0}/${result?.total ?? 0} passed`}
      </p>
      {submit && (
        <ul className="flex flex-wrap gap-2" data-testid="counts">
          {Object.entries(submit.counts).map(([k, v]) => (
            <li key={k} className="bg-muted rounded px-2 py-0.5" data-testid={`count-${k}`}>
              {k}: {v.passed}/{v.total}
            </li>
          ))}
        </ul>
      )}
      {submit?.buildError && <pre className="bg-muted max-h-48 overflow-auto rounded p-2 font-mono whitespace-pre-wrap">{submit.buildError}</pre>}
      <ul className="space-y-1" data-testid="test-list">
        {tests.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={t.status === "passed" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{t.status === "passed" ? "✓" : "✗"}</span>
            <span className="flex-1">
              <span className="font-mono">{t.label}</span>
              <span className="text-muted-foreground ml-2">{t.hidden ? `hidden · ${t.category}` : t.category}</span>
              {t.status !== "passed" && t.message && <pre className="bg-muted mt-1 max-h-32 overflow-auto rounded p-1.5 font-mono whitespace-pre-wrap">{t.message}</pre>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
