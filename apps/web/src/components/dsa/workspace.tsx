"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "@swemock/shared";
import { Markdown } from "@/components/markdown";
import { CodeEditor } from "@/components/code-editor-lazy";
import { SplitPane } from "@/components/split-pane";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { EditorialPayload, HintPayload, RunResponse } from "@/lib/dsa-types";
import { cn } from "@/lib/utils";
import { PacketPanel } from "@/components/ai/packet-panel";
import { VerdictPanel } from "./verdict-panel";

export interface WorkspaceLanguage {
  id: Language;
  label: string;
  monaco: string;
  stub: string;
  /** The user's saved draft for this language, if any. */
  draft: string | null;
}

export interface WorkspaceProps {
  slug: string;
  title: string;
  difficulty: string;
  tags: string[];
  statementMd: string;
  languages: WorkspaceLanguage[];
  samples: { id: string; label: string; input: unknown }[];
  mode: "practice" | "oa" | "interview";
  sessionId: string | null;
  /** A model is configured: approach checks run live instead of via a copy-prompt packet. */
  aiConnected?: boolean;
  solved: boolean;
  hintCount: number;
  initialHints: { level: number; text: string }[];
  initialEditorial: EditorialPayload | null;
}

const AUTOSAVE_MS = 5000;
type LeftTab = "description" | "approach" | "hints" | "editorial";
type ConsoleTab = "testcase" | "result";

export function ProblemWorkspace(props: WorkspaceProps) {
  const { slug, mode, languages, hintCount } = props;
  const [language, setLanguage] = useState<Language>(languages[0]!.id);
  const [code, setCode] = useState<Record<string, string>>(() =>
    Object.fromEntries(languages.map((l) => [l.id, l.draft ?? l.stub])),
  );
  const [sessionId, setSessionId] = useState<string | null>(props.sessionId);
  const [solved, setSolved] = useState(props.solved);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [leftTab, setLeftTab] = useState<LeftTab>("description");
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("testcase");
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const [hints, setHints] = useState(props.initialHints);
  const [editorial, setEditorial] = useState(props.initialEditorial);

  const dirty = useRef(new Set<Language>());
  const busyRef = useRef(false);
  // Event handlers and timers read the latest values through refs (updated after each commit).
  const sessionRef = useRef(sessionId);
  const codeRef = useRef(code);
  useEffect(() => {
    sessionRef.current = sessionId;
    codeRef.current = code;
  });

  const lang = languages.find((l) => l.id === language)!;

  // ---- autosave (every 5s, plus when switching language and when the page is hidden) ----
  const flush = useCallback(
    async (keepalive = false) => {
      const pending = [...dirty.current];
      if (!pending.length) return;
      dirty.current.clear();
      setSaved("saving");
      try {
        await Promise.all(
          pending.map((l) =>
            fetch(`/api/dsa/${slug}/draft`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ language: l, code: codeRef.current[l], sessionId: sessionRef.current ?? undefined }),
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

  function onCodeChange(value: string) {
    setCode((c) => ({ ...c, [language]: value }));
    dirty.current.add(language);
    if (saved !== "saving") setSaved("saving");
  }

  function switchLanguage(next: Language) {
    void flush();
    setLanguage(next);
  }

  // ---- run / submit ----
  const execute = useCallback(
    async (kind: "run" | "submit") => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(kind);
      setError(null);
      setConsoleTab("result");
      try {
        await flush();
        const res = await api<RunResponse>(`/api/dsa/${slug}/${kind}`, "POST", {
          language,
          code: codeRef.current[language],
          sessionId: sessionRef.current ?? undefined,
          customInput: kind === "run" && customInput.trim() ? customInput : undefined,
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
    [slug, language, customInput, flush],
  );

  // Cmd/Ctrl+Enter runs and Cmd/Ctrl+Shift+Enter submits, also when focus is outside the editor.
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

  // ---- hints ----
  async function revealHint(level: number) {
    setError(null);
    try {
      const res = await api<HintPayload>(`/api/dsa/${slug}/hint`, "POST", { level, sessionId: sessionRef.current ?? undefined });
      setSessionId(res.sessionId);
      setHints((h) => (h.some((x) => x.level === level) ? h : [...h, { level, text: res.text }].sort((a, b) => a.level - b.level)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function showEditorial() {
    setError(null);
    try {
      const res = await api<EditorialPayload & { sessionId: string }>(`/api/dsa/${slug}/editorial`, "POST", {
        sessionId: sessionRef.current ?? undefined,
      });
      setSessionId(res.sessionId);
      setEditorial({ editorialMd: res.editorialMd, references: res.references });
      setLeftTab("editorial");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function giveUp() {
    if (!window.confirm("Give up and show the solution? This problem will be scheduled for review.")) return;
    setError(null);
    try {
      const res = await api<EditorialPayload>(`/api/dsa/${slug}/giveup`, "POST", { sessionId: sessionRef.current ?? undefined });
      setEditorial(res);
      setSessionId(null);
      setLeftTab("editorial");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const revealedCount = hints.length;
  const canSeeEditorial = revealedCount >= hintCount || solved;

  const left = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Problem">
      <div role="tablist" aria-label="Problem sections" className="border-border flex shrink-0 gap-1 border-b px-2 pt-1">
        {(
          [
            "description",
            ...(mode === "practice" ? ["approach"] : []),
            ...(mode !== "oa" ? ["hints"] : []),
            ...(editorial ? ["editorial"] : []),
          ] as LeftTab[]
        ).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={leftTab === t}
            onClick={() => setLeftTab(t)}
            className={cn(
              "rounded-t-md px-3 py-1.5 text-sm capitalize",
              leftTab === t ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {leftTab === "description" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{props.title}</h1>
              <span className={cn("rounded-full border border-border px-2 py-0.5 text-xs capitalize", difficultyColor(props.difficulty))}>
                {props.difficulty}
              </span>
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
            <Markdown>{props.statementMd}</Markdown>
          </>
        )}
        {leftTab === "approach" && mode === "practice" && (
          <ApproachCheck slug={slug} sessionId={sessionId} aiConnected={Boolean(props.aiConnected)} onSession={setSessionId} />
        )}
        {leftTab === "hints" && mode !== "oa" && (
          <HintLadder
            interview={mode === "interview"}
            hintCount={hintCount}
            hints={hints}
            canSeeEditorial={canSeeEditorial}
            editorialShown={Boolean(editorial)}
            onHint={revealHint}
            onEditorial={showEditorial}
            onGiveUp={giveUp}
          />
        )}
        {leftTab === "editorial" && editorial && <EditorialView editorial={editorial} languages={languages} />}
      </div>
    </section>
  );

  const right = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Code">
      <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="sr-only">Language</span>
          <select
            aria-label="Language"
            value={language}
            onChange={(e) => switchLanguage(e.target.value as Language)}
            className="bg-background rounded-md border border-border px-2 py-1 text-sm"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground text-xs" aria-live="polite" data-testid="save-status">
          {saved === "saved" ? "Saved" : saved === "saving" ? "Saving…" : "Couldn't save"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => void execute("run")} disabled={busy !== null} data-testid="run-button" title="Ctrl/Cmd+Enter">
            {busy === "run" ? "Running…" : "Run"}
          </Button>
          <Button onClick={() => void execute("submit")} disabled={busy !== null} data-testid="submit-button" title="Ctrl/Cmd+Shift+Enter">
            {busy === "submit" ? "Judging…" : "Submit"}
          </Button>
        </div>
      </div>
      <SplitPane
        direction="column"
        initial={62}
        className="min-h-0 flex-1"
        first={
          <CodeEditor
            language={lang.monaco}
            value={code[language]!}
            onChange={onCodeChange}
            onRun={() => void execute("run")}
            onSubmit={() => void execute("submit")}
          />
        }
        second={
          <div className="flex h-full min-h-0 flex-col">
            <div role="tablist" aria-label="Console" className="border-border flex shrink-0 gap-1 border-b px-2 pt-1">
              {(["testcase", "result"] as ConsoleTab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={consoleTab === t}
                  onClick={() => setConsoleTab(t)}
                  className={cn(
                    "rounded-t-md px-3 py-1 text-sm capitalize",
                    consoleTab === t ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto" aria-live="polite">
              {consoleTab === "testcase" && (
                <div className="space-y-3 p-3 text-sm">
                  <p className="text-muted-foreground">
                    Run checks your code on the {props.samples.length} sample{props.samples.length === 1 ? "" : "s"}
                    {" "}and, if you fill it in, your own input.
                  </p>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">Custom input (JSON, optional)</span>
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder={JSON.stringify(props.samples[0]?.input)}
                      spellCheck={false}
                      aria-label="Custom input"
                      className="bg-card h-20 w-full rounded-md border border-border p-2 font-mono text-xs"
                    />
                  </label>
                  <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCustomInput(JSON.stringify(props.samples[0]?.input))}>
                    Fill from sample 1
                  </Button>
                </div>
              )}
              {consoleTab === "result" && (
                <>
                  {busy && <p className="text-muted-foreground p-3 text-sm">{busy === "run" ? "Running your code…" : "Judging against all tests…"}</p>}
                  {error && !busy && (
                    <p role="alert" className="p-3 text-sm text-red-600 dark:text-red-400" data-testid="error">
                      {error}
                    </p>
                  )}
                  {result && !busy && !error && <VerdictPanel result={result} />}
                  {!result && !busy && !error && <p className="text-muted-foreground p-3 text-sm">Run or submit to see results here.</p>}
                </>
              )}
            </div>
          </div>
        }
      />
    </section>
  );

  return (
    <div className={cn("h-full min-h-0", mode === "oa" && "min-h-[600px]")}>
      <SplitPane first={left} second={right} initial={42} className="h-full" />
    </div>
  );
}

export function difficultyColor(d: string): string {
  return d === "easy"
    ? "text-emerald-600 dark:text-emerald-400"
    : d === "medium"
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
}

export function HintLadder(props: {
  interview: boolean;
  hintCount: number;
  hints: { level: number; text: string }[];
  canSeeEditorial: boolean;
  editorialShown: boolean;
  onHint: (level: number) => void;
  onEditorial: () => void;
  onGiveUp: () => void;
}) {
  const next = props.hints.length + 1;
  return (
    <div className="space-y-4 text-sm">
      {props.interview ? (
        <p className="text-amber-600 dark:text-amber-400" data-testid="hint-penalty">
          This is an interview: hints are recorded and lower your score, as they would with a real interviewer. The editorial is in the
          debrief.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Hints are revealed one at a time, from a nudge toward the full editorial. Using them is fine in practice mode; problems you
          needed help with come back for review.
        </p>
      )}
      <ol className="space-y-3">
        {Array.from({ length: props.hintCount }, (_, i) => i + 1).map((level) => {
          const hint = props.hints.find((h) => h.level === level);
          return (
            <li key={level} className="rounded-md border border-border p-3" data-testid={`hint-${level}`}>
              <p className="mb-1 text-xs font-medium">Hint {level} of {props.hintCount}</p>
              {hint ? (
                <Markdown>{hint.text}</Markdown>
              ) : (
                <Button variant="outline" disabled={level !== next} onClick={() => props.onHint(level)} data-testid={`reveal-hint-${level}`}>
                  Reveal hint {level}
                </Button>
              )}
            </li>
          );
        })}
        {!props.interview && (
        <li className="rounded-md border border-border p-3">
          <p className="mb-1 text-xs font-medium">Hint {props.hintCount + 1}: the editorial</p>
          <Button
            variant="outline"
            disabled={!props.canSeeEditorial || props.editorialShown}
            onClick={props.onEditorial}
            data-testid="reveal-editorial"
          >
            {props.editorialShown ? "Editorial shown" : "Show the editorial"}
          </Button>
          {!props.canSeeEditorial && <p className="text-muted-foreground mt-2 text-xs">Unlocks after all four hints, or once you solve the problem.</p>}
        </li>
        )}
      </ol>
      {!props.interview && (
        <div className="border-border border-t pt-3">
          <Button variant="ghost" onClick={props.onGiveUp} data-testid="give-up" className="text-red-600 dark:text-red-400">
            Give up and show the solution
          </Button>
        </div>
      )}
    </div>
  );
}

function EditorialView({ editorial, languages }: { editorial: EditorialPayload; languages: WorkspaceLanguage[] }) {
  const available = languages.filter((l) => editorial.references[l.id]);
  const [pick, setPick] = useState<Language | null>(null);
  const current = available.find((l) => l.id === pick) ?? available[0];
  return (
    <div className="space-y-6" data-testid="editorial">
      <Markdown>{editorial.editorialMd}</Markdown>
      {current && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Reference solution</h2>
          <div role="tablist" aria-label="Reference language" className="mb-2 flex gap-1">
            {available.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={current.id === l.id}
                onClick={() => setPick(l.id)}
                className={cn("rounded-md border border-border px-2 py-0.5 text-xs", current.id === l.id && "bg-muted font-medium")}
              >
                {l.label}
              </button>
            ))}
          </div>
          <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs">{editorial.references[current.id]}</pre>
        </div>
      )}
    </div>
  );
}

/** Approach Check (spec §7.8): a verdict on a plan, never code. Live with a model, or via a packet. */
export function ApproachCheck(props: { slug: string; itemType?: "dsa" | "lld"; sessionId: string | null; aiConnected: boolean; onSession: (id: string) => void }) {
  const type = props.itemType ?? "dsa";
  const [approach, setApproach] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approachRef = useRef(approach);
  useEffect(() => {
    approachRef.current = approach;
  });

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ sessionId: string; reply: string }>(`/api/${type}/${props.slug}/approach`, "POST", {
        approach,
        sessionId: props.sessionId ?? undefined,
      });
      props.onSession(res.sessionId);
      setReply(res.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm" data-testid="approach-check">
      <p className="text-muted-foreground">
        Describe your plan in plain words (no code). You&apos;ll get a verdict, &ldquo;Works&rdquo;, &ldquo;Works but suboptimal&rdquo;, or
        &ldquo;Doesn&apos;t work&rdquo;, and a line of why. No AI at all? The hint ladder serves the same purpose.
      </p>
      <textarea
        value={approach}
        onChange={(e) => setApproach(e.target.value)}
        aria-label="Your approach"
        placeholder="For example: scan once and keep a hash map of counts… (design problems: the classes, who owns what, and the data structures)"
        className="bg-card h-28 w-full rounded-md border border-border p-2 text-sm"
      />
      {props.aiConnected ? (
        <>
          <Button onClick={check} disabled={busy || !approach.trim()} data-testid="check-approach">
            {busy ? "Checking…" : "Check approach"}
          </Button>
          {reply && (
            <div className="bg-muted rounded-md p-3 whitespace-pre-wrap" data-testid="approach-reply">
              {reply}
            </div>
          )}
          {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
        </>
      ) : (
        <PacketPanel
          kind="approach-check"
          slug={props.slug}
          itemType={type}
          sessionId={props.sessionId ?? undefined}
          getApproach={() => approachRef.current}
          title="Check it with any chatbot"
          description="No AI provider is configured. Copy this prompt into claude.ai or another assistant; paste the verdict back to keep it with this attempt."
          pasteLabel="Paste the verdict"
          onPasted={(_r, p) => props.onSession(p.sessionId)}
        />
      )}
    </div>
  );
}
