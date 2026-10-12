import "server-only";
import type { DsaPublic } from "@swemock/content";
import type { Language } from "@swemock/shared";
import { getDsa, getDsaPrivate } from "./content/repo";
import { resolveAi } from "./ai/config";
import { sessionUsage, type SessionUsage } from "./ai/usage";
import { getSession, sessionEvents, type SessionRow } from "./dsa/store";
import { settleInterview } from "./interview/engine";
import { readState } from "./interview/state";
import { loadScorecard, type ScorecardView } from "./scoring/scorecard";

/** One moment in the replay: what happened, plus the code as of that moment. */
export interface Frame {
  ts: number;
  /** Seconds since the session started. */
  at: number;
  kind: string;
  label: string;
  detail: string | null;
  code: { language: string; code: string } | null;
}

export interface DebriefData {
  session: Pick<SessionRow, "id" | "mode" | "driver" | "status" | "startedAt" | "endedAt">;
  liveVia: "app" | "packet" | null;
  problem: Pick<DsaPublic, "slug" | "title" | "difficulty"> | null;
  frames: Frame[];
  scorecard: ScorecardView | null;
  /** Revealed only after the round (spec §7.6). */
  reveal: { editorialMd: string; references: Partial<Record<Language, string>>; followups: string[] } | null;
  aiConnected: boolean;
  usage: SessionUsage;
}

function label(kind: string, p: Record<string, unknown>): { label: string; detail: string | null } {
  switch (kind) {
    case "chat": {
      const who = p.from === "interviewer" ? "Interviewer" : p.from === "candidate" ? "You" : "Note";
      return { label: `${who}${p.filtered ? " (blocked by the leak filter)" : ""}`, detail: String(p.text) };
    }
    case "run":
    case "submit":
      return {
        label: `${kind === "run" ? "Run" : "Submit"} (${p.language === "cpp" ? "C++" : "Python"}): ${String(p.verdict).replace(/_/g, " ")}`,
        detail: `${p.passed}/${p.total} passed${p.custom ? ", with custom input" : ""}`,
      };
    case "hint":
      return p.nudge
        ? { label: "Interviewer nudge", detail: (p.text as string) ?? null }
        : { label: Number(p.level) > 4 ? (p.gaveUp ? "Gave up: editorial shown" : "Editorial shown") : `Hint ${p.level} revealed`, detail: null };
    case "phase_change":
      return { label: p.to === "ended" ? "Ended" : `Phase: ${p.to}`, detail: p.auto ? "time" : String(p.reason ?? "") || null };
    case "code_snapshot":
      return { label: "Code snapshot", detail: null };
    case "approach_check":
      return { label: "Approach check", detail: `${p.approach ?? ""}${p.reply ? `\n→ ${p.reply}` : p.text ? `\n→ ${p.text}` : ""}`.trim() };
    case "packet_copied":
      return { label: `Packet ${p.action === "download" ? "downloaded" : "copied"}: ${p.kind}`, detail: null };
    case "reply_pasted":
      return { label: p.via === "ai" ? "Graded by AI" : `Reply pasted: ${p.kind}${p.ok === false ? " (didn't validate)" : ""}`, detail: null };
    default:
      return { label: kind.replace(/_/g, " "), detail: null };
  }
}

export function loadDebrief(sessionId: string): DebriefData | null {
  let session = getSession(sessionId);
  if (!session) return null;
  if (session.mode === "interview") session = settleInterview(sessionId).session;
  const slug = session.itemId?.split(":")[1] ?? null;
  const problem = slug ? getDsa(slug) : null;

  let code: Frame["code"] = null;
  const frames: Frame[] = sessionEvents<Record<string, unknown>>(session.id)
    .filter((e) => e.kind !== "self_score")
    .map((e) => {
      const p = e.payload;
      if (typeof p.code === "string" && typeof p.language === "string") code = { language: p.language, code: p.code };
      return { ts: e.ts, at: Math.max(0, Math.round((e.ts - session.startedAt) / 1000)), kind: e.kind, ...label(e.kind, p), code };
    });

  const ended = session.status !== "active";
  const priv = slug && ended ? getDsaPrivate(slug) : null;
  return {
    session: { id: session.id, mode: session.mode, driver: session.driver, status: session.status, startedAt: session.startedAt, endedAt: session.endedAt },
    liveVia: session.mode === "interview" ? readState(session).liveVia : null,
    problem: problem ? { slug: problem.pub.slug, title: problem.pub.title, difficulty: problem.pub.difficulty } : null,
    frames,
    scorecard: session.mode === "interview" && ended ? loadScorecard(session.id) : null,
    reveal: priv ? { editorialMd: priv.editorialMd, references: priv.references, followups: priv.followups } : null,
    aiConnected: resolveAi().connected,
    usage: sessionUsage(session.id),
  };
}
