"use client";

import { PacketPanel } from "@/components/ai/packet-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clock, type InterviewApi } from "./use-interview";

/** The strip above every interview: phases, the clock, Move on, End interview. */
export function InterviewBar({ iv }: { iv: InterviewApi }) {
  const { state, phaseLeft, totalLeft } = iv;
  return (
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
        <Button variant="ghost" className="h-7 text-xs" onClick={() => void iv.advance()} data-testid="next-phase">
          Move on
        </Button>
        <Button variant="outline" className="h-7 text-xs" onClick={() => void iv.end()} data-testid="end-interview">
          End interview
        </Button>
      </div>
    </div>
  );
}

export function ChatHeader({ iv }: { iv: InterviewApi }) {
  const { state, liveVia } = iv;
  return (
    <div className="border-border shrink-0 border-b px-3 py-2 text-sm font-medium">
      {liveVia === "packet" ? "Interview in another chat" : state?.driver === "llm" ? "AI interviewer" : "Scripted interviewer"}
      {state && state.usage.total > 0 && (
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          {state.usage.total.toLocaleString()} tokens{state.usage.cap ? ` of ${state.usage.cap.toLocaleString()}` : ""}
        </span>
      )}
    </div>
  );
}

export function ChatLog({ iv }: { iv: InterviewApi }) {
  return (
    <ol className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm" aria-live="polite" data-testid="chat-log">
      {iv.messages.map((m) => (
        <li
          key={m.id}
          className={cn(
            m.from === "system" && "text-muted-foreground text-center text-xs",
            m.from === "candidate" && "bg-primary/10 ml-8 rounded-lg p-2",
            m.from === "interviewer" && "bg-muted mr-8 rounded-lg p-2",
            m.tag === "cs-reveal" && "border-l-4 border-emerald-500/60",
          )}
          data-from={m.from}
          data-tag={m.tag ?? undefined}
        >
          {m.from !== "system" && <span className="text-muted-foreground mb-0.5 block text-xs">{m.from === "candidate" ? "You" : "Interviewer"}</span>}
          <span className="whitespace-pre-wrap">{m.text}</span>
        </li>
      ))}
      {iv.streaming !== null && (
        <li className="bg-muted mr-8 rounded-lg p-2" data-from="interviewer" data-testid="streaming">
          <span className="text-muted-foreground mb-0.5 block text-xs">Interviewer</span>
          <span className="whitespace-pre-wrap">{iv.streaming || "…"}</span>
        </li>
      )}
    </ol>
  );
}

/** Shown when the AI interviewer fails (spec §12): carry on scripted, or move to copy-prompt. */
export function AiErrorBar({ iv }: { iv: InterviewApi }) {
  if (!iv.aiError) return null;
  return (
    <div role="alert" className="shrink-0 space-y-2 border-t border-amber-500/50 bg-amber-500/10 p-3 text-xs" data-testid="ai-error">
      <p>{iv.aiError}</p>
      <div className="flex gap-2">
        <Button variant="outline" className="h-7 text-xs" onClick={() => void iv.switchDriver("scripted")}>
          Continue with the scripted interviewer
        </Button>
        <Button variant="outline" className="h-7 text-xs" onClick={() => void iv.switchDriver("packet")}>
          Switch to copy-prompt
        </Button>
      </div>
    </div>
  );
}

export function LivePacket({ kind, sessionId, description }: { kind: "dsa-interview-live" | "recruiter-live" | "behavioral-live"; sessionId: string; description: string }) {
  return (
    <div className="shrink-0 border-b border-border p-3">
      <PacketPanel kind={kind} sessionId={sessionId} title="Live interview packet" description={description} pasteLabel="Paste the conversation (optional, for grading)" />
    </div>
  );
}
