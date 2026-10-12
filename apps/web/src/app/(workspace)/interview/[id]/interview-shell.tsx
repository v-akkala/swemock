"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PacketPanel } from "@/components/ai/packet-panel";
import { ProblemWorkspace, type WorkspaceProps } from "@/components/dsa/workspace";
import { SplitPane } from "@/components/split-pane";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Phase {
  id: string;
  label: string;
  minutes: number;
}

interface ChatMessage {
  id: string;
  ts: number;
  from: "interviewer" | "candidate" | "system";
  text: string;
  filtered: boolean;
}

interface InterviewState {
  status: string;
  serverNow: number;
  deadline: number;
  phases: Phase[];
  phaseIndex: number;
  phaseEndsAt: number;
  driver: "scripted" | "llm";
  liveVia: "app" | "packet";
  messages: ChatMessage[];
  usage: { total: number; cap: number };
  aiConnected: boolean;
}

const POLL_MS = 3000;

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function InterviewShell({ sessionId, workspace, liveVia: initialLiveVia }: { sessionId: string; workspace: WorkspaceProps; liveVia: "app" | "packet" }) {
  const router = useRouter();
  const [state, setState] = useState<InterviewState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [streaming, setStreaming] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastTs = useRef(0);
  const ending = useRef(false);

  const poll = useCallback(async () => {
    try {
      const s = await api<InterviewState>(`/api/interview/${sessionId}/state?after=${lastTs.current}`, "GET");
      setOffset(s.serverNow - Date.now());
      setState(s);
      if (s.messages.length) {
        lastTs.current = s.messages[s.messages.length - 1]!.ts;
        setMessages((m) => [...m, ...s.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      }
      if (s.status !== "active" && !ending.current) {
        ending.current = true;
        router.push(`/debrief/${sessionId}`);
      }
    } catch {
      /* transient; the next poll retries */
    }
  }, [router, sessionId]);

  useEffect(() => {
    void poll();
    const p = setInterval(() => void poll(), POLL_MS);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(p);
      clearInterval(t);
    };
  }, [poll]);

  async function send() {
    const text = input.trim();
    if (!text || streaming !== null) return;
    setInput("");
    setError(null);
    setAiError(null);
    // Show the message right away; the next poll replaces it with the stored one.
    setMessages((m) => [...m, { id: `local-${Date.now()}`, ts: Date.now(), from: "candidate", text, filtered: false }]);
    const res = await fetch(`/api/interview/${sessionId}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `Couldn't send (${res.status}).`);
      return;
    }
    if (res.headers.get("content-type")?.includes("text/event-stream")) {
      setStreaming("");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let shown = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, idx).replace(/^data: /, "");
          buffer = buffer.slice(idx + 2);
          const ev = JSON.parse(line) as { type: string; text?: string; message?: string };
          if (ev.type === "delta") setStreaming((shown += ev.text ?? ""));
          if (ev.type === "replace") setStreaming((shown = ev.text ?? ""));
          if (ev.type === "error") setAiError(ev.message ?? "The AI interviewer failed.");
        }
      }
      setStreaming(null);
    }
    setMessages((m) => m.filter((x) => !x.id.startsWith("local-")));
    await poll();
  }

  async function switchDriver(to: "scripted" | "packet") {
    await api(`/api/interview/${sessionId}/driver`, "POST", { to });
    setAiError(null);
    if (to === "packet") router.refresh();
    await poll();
  }

  async function advance() {
    try {
      await api(`/api/interview/${sessionId}/advance`, "POST", {});
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function end() {
    if (!window.confirm("End the interview now and go to the debrief?")) return;
    ending.current = true;
    await api(`/api/interview/${sessionId}/end`, "POST", {});
    router.push(`/debrief/${sessionId}`);
  }

  const serverNow = now + offset;
  const liveVia = state?.liveVia ?? initialLiveVia;
  const phaseLeft = state ? state.phaseEndsAt - serverNow : 0;
  const totalLeft = state ? state.deadline - serverNow : 0;

  const chat = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Interviewer">
      <div className="border-border shrink-0 border-b px-3 py-2 text-sm font-medium">
        {liveVia === "packet" ? "Interview in another chat" : state?.driver === "llm" ? "AI interviewer" : "Scripted interviewer"}
        {state && state.usage.total > 0 && (
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            {state.usage.total.toLocaleString()} tokens{state.usage.cap ? ` of ${state.usage.cap.toLocaleString()}` : ""}
          </span>
        )}
      </div>
      {liveVia === "packet" && (
        <div className="shrink-0 border-b border-border p-3">
          <PacketPanel
            kind="dsa-interview-live"
            sessionId={sessionId}
            title="Live interview packet"
            description="Paste this into claude.ai (or any assistant) to start the interview there. Before you end the round, paste the conversation back so it can be graded."
            pasteLabel="Paste the conversation (optional, for grading)"
          />
        </div>
      )}
      <ol className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm" aria-live="polite" data-testid="chat-log">
        {messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              m.from === "system" && "text-muted-foreground text-center text-xs",
              m.from === "candidate" && "bg-primary/10 ml-8 rounded-lg p-2",
              m.from === "interviewer" && "bg-muted mr-8 rounded-lg p-2",
            )}
            data-from={m.from}
          >
            {m.from !== "system" && <span className="text-muted-foreground mb-0.5 block text-xs">{m.from === "candidate" ? "You" : "Interviewer"}</span>}
            <span className="whitespace-pre-wrap">{m.text}</span>
          </li>
        ))}
        {streaming !== null && (
          <li className="bg-muted mr-8 rounded-lg p-2" data-from="interviewer" data-testid="streaming">
            <span className="text-muted-foreground mb-0.5 block text-xs">Interviewer</span>
            <span className="whitespace-pre-wrap">{streaming || "…"}</span>
          </li>
        )}
      </ol>
      {aiError && (
        <div role="alert" className="shrink-0 space-y-2 border-t border-amber-500/50 bg-amber-500/10 p-3 text-xs" data-testid="ai-error">
          <p>{aiError}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-7 text-xs" onClick={() => void switchDriver("scripted")}>
              Continue with the scripted interviewer
            </Button>
            <Button variant="outline" className="h-7 text-xs" onClick={() => void switchDriver("packet")}>
              Switch to copy-prompt
            </Button>
          </div>
        </div>
      )}
      {liveVia === "app" && (
        <form
          className="shrink-0 border-t border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                void send();
              }
            }}
            aria-label="Message to the interviewer"
            placeholder="Think out loud here. Enter sends, Shift+Enter for a new line."
            className="bg-card h-20 w-full rounded-md border border-border p-2 text-sm"
            data-testid="chat-input"
          />
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}
    </section>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-1.5">
        <ol className="flex flex-wrap gap-1 text-xs" aria-label="Phases" data-testid="phases">
          {(state?.phases ?? []).map((p, i) => (
            <li
              key={p.id}
              aria-current={i === state?.phaseIndex ? "step" : undefined}
              className={cn(
                "rounded-md px-2 py-0.5",
                i === state?.phaseIndex ? "bg-primary text-primary-foreground" : i < (state?.phaseIndex ?? 0) ? "text-muted-foreground line-through" : "text-muted-foreground",
              )}
            >
              {p.label}
            </li>
          ))}
        </ol>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground text-xs" title="Time left in this phase">
            phase <span className="font-mono tabular-nums">{clock(phaseLeft)}</span>
          </span>
          <span role="timer" aria-label="Time remaining" className={cn("font-mono tabular-nums", totalLeft < 5 * 60_000 && "font-semibold text-red-600 dark:text-red-400")} data-testid="interview-timer">
            {clock(totalLeft)}
          </span>
          <Button variant="ghost" className="h-7 text-xs" onClick={() => void advance()} data-testid="next-phase">
            Move on
          </Button>
          <Button variant="outline" className="h-7 text-xs" onClick={() => void end()} data-testid="end-interview">
            End interview
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <SplitPane first={<ProblemWorkspace {...workspace} />} second={chat} initial={72} min={45} max={85} className="h-full" />
      </div>
    </div>
  );
}
