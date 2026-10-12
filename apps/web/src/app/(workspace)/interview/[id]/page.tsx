import { notFound, redirect } from "next/navigation";
import { CODEGEN, LANGUAGES, LANGUAGE_LABELS } from "@swemock/shared";
import { getDsa, getDsaPrivate } from "@/server/content/repo";
import { getSession, loadDrafts, sessionEvents } from "@/server/dsa/store";
import { settleInterview } from "@/server/interview/engine";
import { InterviewShell } from "./interview-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Interview · swemock" };

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = getSession(id);
  if (!found || found.mode !== "interview" || !found.itemId) notFound();
  const { session, state } = settleInterview(id);
  if (session.status !== "active") redirect(`/debrief/${id}`);

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
