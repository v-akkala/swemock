import "server-only";
import {
  exampleResumeFeedback,
  exampleRewrite,
  resumeFeedbackSchema,
  rewriteSchema,
  unsupportedNumbers,
  type ResumeFeedback,
  type RewriteResult,
} from "@swemock/shared";
import { BEHAVIORAL_RUBRIC, RECRUITER_RUBRIC, exampleGrade, type Rubric } from "@swemock/shared/scoring";
import type { z } from "zod";
import { getBehavioralPrivate, getBehavioralPublic, getCsPrivate, getCsPublic } from "./content/questions";
import { sessionEvents, type SessionRow } from "./dsa/store";
import { ApiError } from "./http/errors";
import { chatMessages, settleInterview } from "./interview/engine";
import { totalMinutes } from "./interview/phases";
import { readState } from "./interview/state";
import { stamp, rubricText, type Packet, type PacketKind } from "./packet-util";
import { loadTemplate, render } from "./prompts/templates";
import { loadScorecard } from "./scoring/scorecard";
import { storiesForPrompt } from "./stories";

/**
 * Packets for the conversation rounds (recruiter screen, behavioral): live, grading, and the two
 * "rewrite" packets. Same rules as the coding packets: live ones carry only what the candidate may see;
 * grading and feedback ones exist only after the round ends (spec §2.5).
 */

function recruiterOf(session: SessionRow) {
  const r = readState(session).round;
  if (r?.kind !== "recruiter") throw new ApiError(400, "This packet is for recruiter screens.");
  return r;
}

function behavioralOf(session: SessionRow) {
  const r = readState(session).round;
  if (r?.kind !== "behavioral") throw new ApiError(400, "This packet is for behavioral interviews.");
  return r;
}

function ended(session: SessionRow): SessionRow {
  const s = settleInterview(session.id).session;
  if (s.status === "active") throw new ApiError(409, "This packet is available after the interview ends.");
  return s;
}

/** The conversation: app chat plus any transcript pasted back from an external chat. */
export function transcriptOf(s: SessionRow, liveKind: PacketKind): string {
  const chat = chatMessages(s.id)
    .filter((c) => c.from !== "system")
    .map((c) => `[${stamp(s, c.ts)}] ${c.from === "interviewer" ? "Interviewer" : "Candidate"}: ${c.text}`);
  const pasted = sessionEvents<Record<string, unknown>>(s.id, "reply_pasted")
    .filter((e) => e.payload.kind === liveKind && e.payload.ok !== false)
    .map((e) => String(e.payload.text));
  return [...chat, ...(pasted.length ? ["", "Transcript pasted from the external chat:", ...pasted] : [])].join("\n") || "(No conversation was recorded.)";
}

/** Candidate-side text of the conversation, used to check that a rewrite introduces no new numbers. */
export function candidateText(s: SessionRow): string[] {
  const chat = chatMessages(s.id).filter((c) => c.from === "candidate").map((c) => c.text);
  const pasted = sessionEvents<Record<string, unknown>>(s.id, "reply_pasted").filter((e) => e.payload.ok !== false && typeof e.payload.text === "string").map((e) => String(e.payload.text));
  return [...chat, ...pasted];
}

const companyClause = (company: string) => (company ? ` at ${company}` : "");

function header(s: SessionRow) {
  const mins = Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 60_000);
  const who = s.driver === "llm" ? "AI" : readState(s).liveVia === "packet" ? "external chat" : "scripted";
  return `- Duration: ${mins} min; interviewer: ${who}`;
}

// ---- recruiter --------------------------------------------------------------------------------------

export function recruiterLive(session: SessionRow): Packet {
  const { session: s, state } = settleInterview(session.id);
  if (s.status !== "active") throw new ApiError(409, "This interview has ended; use the grading packet instead.");
  const r = recruiterOf(s);
  const questions = r.pool
    .map((p) => getCsPublic(p.id))
    .filter((q) => q !== null)
    .map((q) => `- [${q.difficulty}] ${q.prompt.trim().replace(/\s+/g, " ")}`)
    .join("\n");
  const t = loadTemplate("packets/recruiter-live.md");
  const markdown = render(t.body, {
    minutes: String(totalMinutes(state.phases)),
    role: r.config.role,
    company_clause: companyClause(r.config.company),
    resume_title: r.config.resumeTitle,
    resume: r.config.resumeText,
    job_description: r.config.jobDescription || "(none provided)",
    questions,
  });
  return { kind: "recruiter-live", markdown, filename: "swemock-recruiter-screen.md", versionTag: t.versionTag, sessionId: s.id };
}

export function recruiterGrading(session: SessionRow): { packet: Packet; rubric: Rubric } {
  const s = ended(session);
  const r = recruiterOf(s);
  const ids = r.asked.length ? r.asked : r.pool.map((p) => p.id);
  const keyPoints = ids
    .map((id) => {
      const pub = getCsPublic(id);
      const priv = getCsPrivate(id);
      if (!pub || !priv) return null;
      const grade = r.grades[id];
      return [
        `- [${pub.difficulty}] ${pub.prompt.trim().replace(/\s+/g, " ")}`,
        `  Key points: ${priv.keyPoints.join("; ")}`,
        grade !== undefined ? `  Candidate's own grade: ${["missed", "partly", "got it"][grade]}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");
  const card = loadScorecard(s.id);
  const t = loadTemplate("packets/recruiter-grading.md");
  const markdown = render(t.body, {
    rubric: rubricText(RECRUITER_RUBRIC),
    dimension_ids: RECRUITER_RUBRIC.dimensions.map((d) => d.id).join(", "),
    role: r.config.role,
    company_clause: companyClause(r.config.company),
    resume_title: r.config.resumeTitle,
    resume: r.config.resumeText,
    job_description: r.config.jobDescription || "(none provided)",
    key_points: keyPoints || "(none)",
    metrics: [header(s), ...card.metricLines.map((l) => `- ${l}`)].join("\n"),
    transcript: transcriptOf(s, "recruiter-live"),
    example: JSON.stringify(exampleGrade(RECRUITER_RUBRIC), null, 2),
  });
  return { packet: { kind: "recruiter-grading", markdown, filename: "swemock-recruiter-grading.md", versionTag: t.versionTag, sessionId: s.id }, rubric: RECRUITER_RUBRIC };
}

export function resumeFeedbackPacket(session: SessionRow): Packet {
  const s = ended(session);
  const r = recruiterOf(s);
  const t = loadTemplate("packets/resume-feedback.md");
  const markdown = render(t.body, {
    resume_title: r.config.resumeTitle,
    resume: r.config.resumeText,
    probes: r.probeBullets.length ? r.probeBullets.map((b) => `- ${b.text}${b.flags.length ? ` (${b.flags.join(", ")})` : ""}`).join("\n") : "(none flagged)",
    transcript: transcriptOf(s, "recruiter-live"),
    example: JSON.stringify(exampleResumeFeedback, null, 2),
  });
  return { kind: "resume-feedback", markdown, filename: "swemock-resume-feedback.md", versionTag: t.versionTag, sessionId: s.id };
}

// ---- behavioral -------------------------------------------------------------------------------------

export function behavioralLive(session: SessionRow): Packet {
  const { session: s, state } = settleInterview(session.id);
  if (s.status !== "active") throw new ApiError(409, "This interview has ended; use the grading packet instead.");
  const r = behavioralOf(s);
  const questions = r.config.questionIds
    .map((slug, i) => {
      const pub = getBehavioralPublic(slug);
      const priv = getBehavioralPrivate(slug);
      if (!pub || !priv) return null;
      return `${i + 1}. ${pub.prompt.trim().replace(/\s+/g, " ")}\n   Suggested follow-ups: ${priv.followUps.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n\n");
  const t = loadTemplate("packets/behavioral-live.md");
  const markdown = render(t.body, {
    minutes: String(totalMinutes(state.phases)),
    count: String(r.config.questionIds.length),
    lens: r.config.lens ?? "none",
    questions,
  });
  return { kind: "behavioral-live", markdown, filename: "swemock-behavioral-interview.md", versionTag: t.versionTag, sessionId: s.id };
}

export function behavioralGrading(session: SessionRow): { packet: Packet; rubric: Rubric } {
  const s = ended(session);
  const r = behavioralOf(s);
  const questions = r.config.questionIds
    .map((slug, i) => {
      const pub = getBehavioralPublic(slug);
      const priv = getBehavioralPrivate(slug);
      if (!pub || !priv) return null;
      return [
        `${i + 1}. ${pub.prompt.trim().replace(/\s+/g, " ")} (competencies: ${pub.competencies.join(", ")})`,
        `   Strong answer: ${priv.strongSignals.join("; ")}`,
        priv.redFlags.length ? `   Red flags: ${priv.redFlags.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  const card = loadScorecard(s.id);
  const t = loadTemplate("packets/behavioral-grading.md");
  const markdown = render(t.body, {
    rubric: rubricText(BEHAVIORAL_RUBRIC),
    dimension_ids: BEHAVIORAL_RUBRIC.dimensions.map((d) => d.id).join(", "),
    questions,
    metrics: [header(s), ...card.metricLines.map((l) => `- ${l}`)].join("\n"),
    transcript: transcriptOf(s, "behavioral-live"),
    example: JSON.stringify(exampleGrade(BEHAVIORAL_RUBRIC), null, 2),
  });
  return { packet: { kind: "behavioral-grading", markdown, filename: "swemock-behavioral-grading.md", versionTag: t.versionTag, sessionId: s.id }, rubric: BEHAVIORAL_RUBRIC };
}

export function rewritePacket(session: SessionRow): Packet {
  const s = ended(session);
  const r = behavioralOf(s);
  const competencies = r.config.questionIds.flatMap((slug) => getBehavioralPublic(slug)?.competencies ?? []);
  const t = loadTemplate("packets/behavioral-rewrite.md");
  const markdown = render(t.body, {
    stories: storiesForPrompt(competencies) || "(none: the transcript is the only source of facts)",
    transcript: transcriptOf(s, "behavioral-live"),
    example: JSON.stringify(exampleRewrite, null, 2),
  });
  return { kind: "behavioral-rewrite", markdown, filename: "swemock-behavioral-rewrites.md", versionTag: t.versionTag, sessionId: s.id };
}

// ---- structured feedback ---------------------------------------------------------------------------------

export const FEEDBACK_SCHEMAS = {
  "resume-feedback": resumeFeedbackSchema,
  "behavioral-rewrite": rewriteSchema,
} as const;
export type FeedbackKind = keyof typeof FEEDBACK_SCHEMAS;
export type FeedbackResult = ResumeFeedback | RewriteResult;

export const isFeedbackKind = (k: string): k is FeedbackKind => k in FEEDBACK_SCHEMAS;

/** "Never fabricate": a rewrite may only use numbers the candidate's own words (or notes) contain. */
export function checkFeedback(kind: FeedbackKind, session: SessionRow, value: z.infer<(typeof FEEDBACK_SCHEMAS)[FeedbackKind]>): string | null {
  const sources = kind === "resume-feedback" ? [recruiterOf(session).config.resumeText, ...candidateText(session)] : [...candidateText(session), storiesForPrompt(behavioralOf(session).config.questionIds.flatMap((q) => getBehavioralPublic(q)?.competencies ?? []))];
  const texts =
    kind === "resume-feedback"
      ? (value as ResumeFeedback).bullets.map((b) => ({ where: `the rewrite of "${b.original.slice(0, 40)}…"`, text: b.rewrite }))
      : (value as RewriteResult).answers.map((a) => ({ where: `the stronger version for "${a.question.slice(0, 40)}…"`, text: a.stronger_version }));
  for (const { where, text } of texts) {
    const bad = unsupportedNumbers(text, sources);
    if (bad.length) return `${where} contains ${bad.map((n) => `"${n}"`).join(", ")}, which the candidate never said. Remove invented facts and list them under what's missing instead.`;
  }
  return null;
}

/** The latest valid feedback of this kind saved for the session (pasted or from the connected model). */
export function storedFeedback<K extends FeedbackKind>(sessionId: string, kind: K): { result: z.infer<(typeof FEEDBACK_SCHEMAS)[K]>; via: string } | null {
  const e = [...sessionEvents<Record<string, unknown>>(sessionId, "reply_pasted")].reverse().find((x) => x.payload.kind === kind && x.payload.ok === true && x.payload.result);
  return e ? { result: e.payload.result as z.infer<(typeof FEEDBACK_SCHEMAS)[K]>, via: String(e.payload.via ?? "pasted") } : null;
}
