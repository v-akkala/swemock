"use client";

import { ProblemWorkspace, type WorkspaceProps } from "@/components/dsa/workspace";
import { ChatPanel } from "@/components/interview/chat-panel";
import { InterviewBar } from "@/components/interview/parts";
import { useInterview } from "@/components/interview/use-interview";
import { FluencyWorkspace, type FluencyWorkspaceProps } from "@/components/fluency/workspace";
import { LldWorkspace, type LldWorkspaceProps } from "@/components/lld/workspace";
import { SplitPane } from "@/components/split-pane";

const DSA_PACKET = "Paste this into claude.ai (or any assistant) to start the interview there. Before you end the round, paste the conversation back so it can be graded.";

/** A timed coding interview: the problem workspace on the left, the interviewer chat on the right. */
export function InterviewShell({ sessionId, workspace, liveVia: initialLiveVia }: { sessionId: string; workspace: WorkspaceProps; liveVia: "app" | "packet" }) {
  const iv = useInterview(sessionId, initialLiveVia);
  return (
    <div className="flex h-full flex-col">
      <InterviewBar iv={iv} />
      <div className="min-h-0 flex-1">
        <SplitPane
          first={<ProblemWorkspace {...workspace} />}
          second={<ChatPanel iv={iv} sessionId={sessionId} packetKind="dsa-interview-live" packetDescription={DSA_PACKET} />}
          initial={72}
          min={45}
          max={85}
          className="h-full"
        />
      </div>
    </div>
  );
}

/** A timed low-level design interview: files, tests, and the spec on the left; the chat on the right. */
export function LldInterviewShell({ sessionId, workspace, liveVia: initialLiveVia }: { sessionId: string; workspace: LldWorkspaceProps; liveVia: "app" | "packet" }) {
  const iv = useInterview(sessionId, initialLiveVia);
  return (
    <div className="flex h-full flex-col">
      <InterviewBar iv={iv} />
      <div className="min-h-0 flex-1">
        <SplitPane
          first={<LldWorkspace {...workspace} externalChange={iv.state?.change ?? null} />}
          second={<ChatPanel iv={iv} sessionId={sessionId} packetKind="lld-interview-live" packetDescription={DSA_PACKET} />}
          initial={74}
          min={50}
          max={85}
          className="h-full"
        />
      </div>
    </div>
  );
}

/** A timed AI Fluency interview: the workspace with its assistant on the left, the interviewer chat on the right. */
export function FluencyInterviewShell({ sessionId, workspace, liveVia: initialLiveVia }: { sessionId: string; workspace: FluencyWorkspaceProps; liveVia: "app" | "packet" }) {
  const iv = useInterview(sessionId, initialLiveVia);
  return (
    <div className="flex h-full flex-col">
      <InterviewBar iv={iv} />
      <div className="min-h-0 flex-1">
        <SplitPane
          first={<FluencyWorkspace {...workspace} />}
          second={<ChatPanel iv={iv} sessionId={sessionId} packetKind="fluency-live" packetDescription={DSA_PACKET} />}
          initial={76}
          min={55}
          max={88}
          className="h-full"
        />
      </div>
    </div>
  );
}
