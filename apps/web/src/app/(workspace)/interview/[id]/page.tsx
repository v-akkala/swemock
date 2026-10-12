import { notFound, redirect } from "next/navigation";
import { CODEGEN, LANGUAGES, LANGUAGE_LABELS } from "@swemock/shared";
import { ConversationShell } from "@/components/interview/conversation-shell";
import { getDb } from "@/server/db";
import { getDsa, getDsaPrivate } from "@/server/content/repo";
import { readSettings } from "@/server/settings";
import { getSession, loadDrafts, sessionEvents } from "@/server/dsa/store";
import { settleInterview } from "@/server/interview/engine";
import { InterviewShell } from "./interview-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Interview · swemock" };

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = getSession(id);
  if (!found || found.mode !== "interview") notFound();
  if (found.roundType === "dsa" && !found.itemId) notFound();
  const { session, state } = settleInterview(id);
  if (session.status !== "active") redirect(`/debrief/${id}`);

  if (session.roundType === "recruiter" || session.roundType === "behavioral") {
    const round = state.round;
    return (
      <ConversationShell
        sessionId={id}
        roundType={session.roundType}
        liveVia={state.liveVia}
        voiceEnabled={readSettings(getDb()).features.voiceInput}
        resume={round?.kind === "recruiter" ? { title: round.config.resumeTitle, text: round.config.resumeText, role: round.config.role, company: round.config.company, jobDescription: round.config.jobDescription } : undefined}
        questionCount={round?.kind === "behavioral" ? round.config.questionIds.length : undefined}
      />
    );
  }

  const slug = session.itemId!.split(":")[1]!;
  const { pub } = getDsa(slug)!;
  const drafts = loadDrafts(session.itemId!, id);
  const revealed = new Set(sessionEvents<{ level: number; nudge?: boolean }>(id, "hint").filter((e) => !e.payload.nudge).map((e) => e.payload.level));
  const hints = getDsaPrivate(slug)!.hints.map((text, i) => ({ level: i + 1, text })).filter((h) => revealed.has(h.level));

  return (
    <InterviewShell
      sessionId={id}
      liveVia={state.liveVia}
      workspace={{
        slug,
        title: pub.title,
        difficulty: pub.difficulty,
        tags: pub.tags,
        statementMd: pub.statementMd,
        languages: LANGUAGES.map((lang) => ({
          id: lang,
          label: LANGUAGE_LABELS[lang],
          monaco: lang === "cpp" ? "cpp" : "python",
          stub: CODEGEN[lang].stub(pub.signature),
          draft: drafts[lang] ?? null,
        })),
        samples: pub.visibleTests.map((t, i) => ({ id: t.id, label: `Sample ${i + 1}`, input: t.input })),
        mode: "interview",
        sessionId: id,
        solved: false,
        hintCount: pub.hintCount,
        initialHints: hints,
        initialEditorial: null,
      }}
    />
  );
}
