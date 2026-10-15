"use client";

import { AiErrorBar, ChatHeader, ChatLog, LivePacket } from "./parts";
import type { InterviewApi } from "./use-interview";

/** The interviewer chat beside a code workspace: log, AI failure bar, and a plain text box. */
export function ChatPanel({
  iv,
  sessionId,
  packetKind,
  packetDescription,
}: {
  iv: InterviewApi;
  sessionId: string;
  packetKind: "dsa-interview-live" | "lld-interview-live" | "fluency-live";
  packetDescription: string;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Interviewer">
      <ChatHeader iv={iv} />
      {iv.liveVia === "packet" && <LivePacket kind={packetKind} sessionId={sessionId} description={packetDescription} />}
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
}
