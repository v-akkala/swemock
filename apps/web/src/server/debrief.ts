import "server-only";
import type { DsaPublic } from "@swemock/content";
import type { Language } from "@swemock/shared";
import type { AnswerSignals, ResumeFeedback, RewriteResult } from "@swemock/shared";
import { getDsa, getDsaPrivate } from "./content/repo";
import { getLld, getLldPrivate } from "./content/lld";
import { revealPayload } from "./lld/service";
import type { LldRevealPayload } from "@/lib/lld-types";
import { getBehavioralPrivate, getBehavioralPublic, getCsPrivate, getCsPublic } from "./content/questions";
import { resolveAi } from "./ai/config";
import { sessionUsage, type SessionUsage } from "./ai/usage";
import { getSession, sessionEvents, type SessionRow } from "./dsa/store";
import { settleInterview } from "./interview/engine";
import { answerTurns } from "./interview/answers";
import { readState } from "./interview/state";
import { storedFeedback } from "./packets-conversation";
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

/** Recruiter screen extras, revealed after the round. */
export interface RecruiterDebrief {
  role: string;
  company: string;
  resumeTitle: string;
  probes: { text: string; flags: string[] }[];
  questions: {
    id: string;
    title: string;
    difficulty: string;
    prompt: string;
    keyPoints: string[];
    modelAnswer: string;
    /** The candidate's own call, if they made one. */
    grade: 0 | 1 | 2 | null;
    answer: string | null;
  }[];
  feedback: { result: ResumeFeedback; via: string } | null;
}

export interface BehavioralDebrief {
  lens: string | null;
  questions: { id: string; title: string; prompt: string; competencies: string[]; strongSignals: string[]; redFlags: string[]; followUps: string[]; tips: string | null }[];
  turns: { prompt: string | null; text: string; signals: AnswerSignals; counts: boolean; questionId: string | null }[];
  rewrites: { result: RewriteResult; via: string } | null;
}

export interface LldDebrief {
  design: LldRevealPayload;
  followups: string[];
  /** The requirement change as introduced (shown with the reference). */
  change: string;
}

export interface DebriefData {
  /** Where "Practice this problem" goes. */
  problemHref: string | null;
  lld: LldDebrief | null;
  roundType: string;
  /** Human title of the round or problem. */
  title: string;
  recruiter: RecruiterDebrief | null;
  behavioral: BehavioralDebrief | null;
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
        detail: `${p.passed}/${p.total} passed${p.custom ? ", with custom input" : ""}${p.extension ? ", with extension tests" : ""}`,
      };
    case "hint":
      return p.nudge
        ? { label: "Interviewer nudge", detail: (p.text as string) ?? null }
        : { label: Number(p.level) > 4 ? (p.gaveUp ? "Gave up: editorial shown" : "Editorial shown") : `Hint ${p.level} revealed`, detail: null };
    case "phase_change":
      return { label: p.to === "ended" ? "Ended" : `Phase: ${p.to}`, detail: p.auto ? "time" : String(p.reason ?? "") || null };
    case "requirement_change":
      return { label: "New requirement introduced", detail: null };
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
  const lldItem = session.roundType === "lld" && slug ? getLld(slug) : null;
  const problem = lldItem ? { pub: lldItem.pub } : slug && session.roundType !== "lld" ? getDsa(slug) : null;

  let code: Frame["code"] = null;
  const frames: Frame[] = sessionEvents<Record<string, unknown>>(session.id)
    .filter((e) => e.kind !== "self_score")
    .map((e) => {
      const p = e.payload;
      if (typeof p.code === "string" && typeof p.language === "string") code = { language: p.language, code: p.code };
      else if (p.files && typeof p.files === "object" && typeof p.language === "string") {
        code = { language: p.language, code: Object.entries(p.files as Record<string, string>).map(([f, t]) => `=== ${f} ===\n${t}`).join("\n\n") };
      }
      return { ts: e.ts, at: Math.max(0, Math.round((e.ts - session.startedAt) / 1000)), kind: e.kind, ...label(e.kind, p), code };
    });

  const ended = session.status !== "active";
  const priv = slug && ended && session.roundType !== "lld" ? getDsaPrivate(slug) : null;
  const lldPriv = lldItem && ended ? getLldPrivate(slug!) : null;
  const conversation = ended && session.mode === "interview" ? conversationExtras(session) : { recruiter: null, behavioral: null };
  return {
    problemHref: problem ? `/${session.roundType === "lld" ? "lld" : "dsa"}/${problem.pub.slug}` : null,
    lld: lldPriv && slug ? { design: revealPayload(slug), followups: lldPriv.followups, change: lldPriv.changeMd } : null,
    roundType: session.roundType,
    title: session.roundType === "recruiter" ? "Recruiter screen" : session.roundType === "behavioral" ? "Behavioral interview" : (problem?.pub.title ?? ""),
    ...conversation,
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

function conversationExtras(session: SessionRow): { recruiter: RecruiterDebrief | null; behavioral: BehavioralDebrief | null } {
  const round = readState(session).round;
  if (round?.kind === "recruiter") {
    const turns = answerTurns(session.id);
    const answerFor = (id: string) => turns.filter((t) => t.promptRef?.kind === "cs" && t.promptRef.id === id).map((t) => t.text).join("\n\n") || null;
    const ids = round.asked.length ? round.asked : [];
    return {
      behavioral: null,
      recruiter: {
        role: round.config.role,
        company: round.config.company,
        resumeTitle: round.config.resumeTitle,
        probes: round.probeBullets,
        questions: ids.flatMap((id) => {
          const pub = getCsPublic(id);
          const priv = getCsPrivate(id);
          if (!pub || !priv) return [];
          return [{ id, title: pub.title, difficulty: pub.difficulty, prompt: pub.prompt, keyPoints: priv.keyPoints, modelAnswer: priv.modelAnswer, grade: round.grades[id] ?? null, answer: answerFor(id) }];
        }),
        feedback: storedFeedback(session.id, "resume-feedback"),
      },
    };
  }
  if (round?.kind === "behavioral") {
    return {
      recruiter: null,
      behavioral: {
        lens: round.config.lens,
        questions: round.config.questionIds.flatMap((id) => {
          const pub = getBehavioralPublic(id);
          const priv = getBehavioralPrivate(id);
          if (!pub || !priv) return [];
          return [{ id, title: pub.title, prompt: pub.prompt, competencies: pub.competencies, strongSignals: priv.strongSignals, redFlags: priv.redFlags, followUps: priv.followUps, tips: priv.tips }];
        }),
        turns: answerTurns(session.id).map((t) => ({ prompt: t.prompt, text: t.text, signals: t.signals, counts: t.counts, questionId: t.promptRef?.id ?? null })),
        rewrites: storedFeedback(session.id, "behavioral-rewrite"),
      },
    };
  }
  return { recruiter: null, behavioral: null };
}
