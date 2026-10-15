"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { AssistantTurn, FluencyType, Proposal } from "@/lib/fluency-types";
import { DiffPreview } from "./diff-preview";

export interface ContextItem {
  path: string;
  from?: number;
  to?: number;
}

interface Turn {
  question: string;
  context: ContextItem[];
  result: AssistantTurn;
  dismissed: Set<string>;
  pasted: boolean;
}

interface Props {
  type: FluencyType;
  slug: string;
  sessionId: string | null;
  files: Record<string, string>;
  activePath: string;
  context: ContextItem[];
  onContext: (items: ContextItem[]) => void;
  aiConnected: boolean;
  onSession: (id: string) => void;
  onApply: (path: string, newText: string, proposalId: string, accepted: string[], rejected: string[]) => void;
}

const label = (c: ContextItem) => `${c.path}${c.from ? `:${c.from}${c.to && c.to !== c.from ? `-${c.to}` : ""}` : ""}`;

/** The AI assistant side panel: ask with attached context; code in the reply goes through a diff preview. */
export function AssistantPanel(props: Props) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/fluency/${props.type}/${props.slug}`;

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<AssistantTurn & { sessionId?: string }>(`${base}/ask`, "POST", {
        question,
        context: props.context,
        files: props.files,
        sessionId: props.sessionId ?? undefined,
      });
      setTurns((t) => [{ question, context: props.context, result, dismissed: new Set(), pasted: false }, ...t]);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function update(promptId: string, fn: (t: Turn) => Turn) {
    setTurns((all) => all.map((t) => (t.result.promptId === promptId ? fn(t) : t)));
  }

  async function paste(turn: Turn, text: string) {
    setError(null);
    try {
      const result = await api<AssistantTurn>(`${base}/paste`, "POST", { text, promptId: turn.result.promptId, activePath: props.activePath, files: props.files, sessionId: props.sessionId ?? undefined });
      update(turn.result.promptId, (t) => ({ ...t, result: { ...result, packet: t.result.packet }, pasted: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function apply(path: string, newText: string, proposalId: string, accepted: string[], rejected: string[]) {
    props.onApply(path, newText, proposalId, accepted, rejected);
    const promptId = proposalId.split("-").slice(0, -1).join("-");
    update(promptId, (t) => ({ ...t, dismissed: new Set(t.dismissed).add(proposalId) }));
    await api(`${base}/apply`, "POST", { proposalId, path, accepted, rejected, sessionId: props.sessionId ?? undefined }).catch(() => undefined);
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="AI assistant" data-testid="assistant-panel">
      <div className="border-border shrink-0 border-b px-3 py-2 text-sm font-medium">AI assistant</div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3 text-sm">
        {turns.length === 0 && (
          <p className="text-muted-foreground text-xs">
            Ask about the code. Use &ldquo;Add to context&rdquo; on the file or a selection so the assistant can see it. Code in a reply goes through a diff preview, and every
            question, attachment, and applied change is logged.
          </p>
        )}
        {turns.map((t) => (
          <div key={t.result.promptId} className="space-y-2" data-testid="assistant-turn">
            <div className="bg-primary/10 rounded-lg p-2">
              <p className="text-muted-foreground mb-0.5 text-xs">You{t.context.length ? ` · ${t.context.map(label).join(", ")}` : ""}</p>
              <p className="whitespace-pre-wrap">{t.question}</p>
            </div>
            {t.result.packet && !t.pasted && <PacketBox packet={t.result.packet} onPaste={(text) => paste(t, text)} />}
            {t.result.reply !== null && (
              <div className="bg-muted rounded-lg p-2" data-testid="assistant-reply">
                <p className="text-muted-foreground mb-0.5 text-xs">Assistant</p>
                <p className="whitespace-pre-wrap">{t.result.reply.replace(/```[\s\S]*?```/g, "[code: see the preview below]")}</p>
              </div>
            )}
            {t.result.proposals.filter((p) => !t.dismissed.has(p.id)).length > 0 && (
              <DiffPreview
                proposals={t.result.proposals.filter((p: Proposal) => !t.dismissed.has(p.id))}
                files={props.files}
                onApply={apply}
                onDismiss={(id) => update(t.result.promptId, (x) => ({ ...x, dismissed: new Set(x.dismissed).add(id) }))}
              />
            )}
          </div>
        ))}
      </div>
      <div className="border-border shrink-0 space-y-2 border-t p-2">
        {props.context.length > 0 && (
          <ul className="flex flex-wrap gap-1" data-testid="context-chips">
            {props.context.map((c, i) => (
              <li key={i} className="bg-muted flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px]">
                {label(c)}
                <button type="button" aria-label={`Remove ${label(c)}`} className="text-muted-foreground hover:text-foreground" onClick={() => props.onContext(props.context.filter((_, j) => j !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Ask the assistant"
          placeholder="Ask the assistant…"
          className="bg-card h-20 w-full rounded-md border border-border p-2 text-sm"
          data-testid="assistant-question"
        />
        <div className="flex items-center gap-2">
          <Button className="h-8" onClick={() => void ask()} disabled={busy || !question.trim()} data-testid="ask-ai">
            {busy ? "Asking…" : props.aiConnected ? "Ask AI" : "Ask AI (copy prompt)"}
          </Button>
          {error && (
            <span role="alert" className="text-xs text-red-600 dark:text-red-400" data-testid="assistant-error">
              {error}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function PacketBox({ packet, onPaste }: { packet: string; onPaste: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-md border border-border p-2" data-testid="assistant-packet">
      <p className="text-xs">No AI provider is configured: copy this prompt into claude.ai or any assistant, then paste its reply below.</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-7 text-xs"
          data-testid="copy-assistant-packet"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(packet);
              setStatus("Copied.");
            } catch {
              setStatus("Your browser blocked the clipboard: select the text below.");
            }
          }}
        >
          Copy prompt
        </Button>
        {status && <span className="text-muted-foreground self-center text-xs">{status}</span>}
      </div>
      <details>
        <summary className="text-muted-foreground cursor-pointer text-xs">Show the prompt</summary>
        <textarea readOnly value={packet} className="bg-card mt-1 h-32 w-full rounded-md border border-border p-2 font-mono text-xs" data-testid="assistant-packet-text" />
      </details>
      <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Paste the assistant's reply" placeholder="Paste the reply here." className="bg-card h-24 w-full rounded-md border border-border p-2 font-mono text-xs" data-testid="assistant-paste" />
      <Button className="h-7 text-xs" disabled={!text.trim()} onClick={() => void onPaste(text)} data-testid="save-assistant-reply">
        Use this reply
      </Button>
    </div>
  );
}
