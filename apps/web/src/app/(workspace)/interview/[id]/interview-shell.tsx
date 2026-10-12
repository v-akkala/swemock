"use client";

import { ProblemWorkspace, type WorkspaceProps } from "@/components/dsa/workspace";
import { AiErrorBar, ChatHeader, ChatLog, InterviewBar, LivePacket } from "@/components/interview/parts";
import { useInterview } from "@/components/interview/use-interview";
import { SplitPane } from "@/components/split-pane";

/** A timed coding interview: the problem workspace on the left, the interviewer chat on the right. */
export function InterviewShell({ sessionId, workspace, liveVia: initialLiveVia }: { sessionId: string; workspace: WorkspaceProps; liveVia: "app" | "packet" }) {
  const iv = useInterview(sessionId, initialLiveVia);

  const chat = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Interviewer">
      <ChatHeader iv={iv} />
      {iv.liveVia === "packet" && (
        <LivePacket
          kind="dsa-interview-live"
          sessionId={sessionId}
          description="Paste this into claude.ai (or any assistant) to start the interview there. Before you end the round, paste the conversation back so it can be graded."
        />
      )}
      <ChatLog iv={iv} />
      <AiErrorBar iv={iv} />
      {iv.liveVia === "app" && (
        <form
          className="shrink-0 border-t border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void iv.send();
          }}
        >
          <textarea
            value={iv.input}
            onChange={(e) => iv.setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                void iv.send();
              }
            }}
            aria-label="Message to the interviewer"
            placeholder="Think out loud here. Enter sends, Shift+Enter for a new line."
            className="bg-card h-20 w-full rounded-md border border-border p-2 text-sm"
            data-testid="chat-input"
          />
          {iv.error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{iv.error}</p>}
        </form>
      )}
    </section>
  );

  return (
    <div className="flex h-full flex-col">
      <InterviewBar iv={iv} />
      <div className="min-h-0 flex-1">
        <SplitPane first={<ProblemWorkspace {...workspace} />} second={chat} initial={72} min={45} max={85} className="h-full" />
      </div>
    </div>
  );
}
