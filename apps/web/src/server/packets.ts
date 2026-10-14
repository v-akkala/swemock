import "server-only";
import { LANGUAGE_LABELS, LANGUAGES, generateStub } from "@swemock/shared";
import { DSA_INTERVIEW_RUBRIC, aiGradeSchema, checkGradeAgainstRubric, exampleGrade, extractJsonBlock, type Rubric } from "@swemock/shared/scoring";
import { getDsa, getDsaPrivate } from "./content/repo";
import { getLld, getLldPrivate } from "./content/lld";
import { ApiError } from "./http/errors";
import { buildLeakFilter } from "./ai/leak-filter";
import { completeJson, completeText } from "./ai/run";
import { resolveAi } from "./ai/config";
import { addEvent, getSession, sessionEvents, startSession, activePracticeSession, type SessionRow } from "./dsa/store";
import { chatMessages, latestCode, settleInterview } from "./interview/engine";
import { phasePlanText, totalMinutes } from "./interview/phases";
import { readState } from "./interview/state";
import { loadTemplate, render } from "./prompts/templates";
import { PACKET_KINDS, rubricText, stamp, type Packet, type PacketKind } from "./packet-util";
import {
  FEEDBACK_SCHEMAS,
  behavioralGrading,
  behavioralLive,
  checkFeedback,
  isFeedbackKind,
  recruiterGrading,
  recruiterLive,
  resumeFeedbackPacket,
  rewritePacket,
  storedFeedback,
  type FeedbackKind,
} from "./packets-conversation";
import { lldGrading, lldLive } from "./packets-lld";
import { dsaMetrics, saveAiGrade, type ScorecardView } from "./scoring/scorecard";

/**
 * Copy-prompt packets (spec §2.4–2.5): self-contained markdown a user pastes into any chatbot.
 * Live packets carry only what the candidate may see. Grading packets exist only after the round ends.
 */
export { PACKET_KINDS, rubricText, type Packet, type PacketKind };

function slugOf(session: SessionRow): string {
  if (!session.itemId) throw new ApiError(400, "This session has no problem.");
  return session.itemId.split(":")[1]!;
}

function signatureLine(slug: string): string {
  const sig = getDsa(slug)!.pub.signature;
  const stub = generateStub(sig, "python");
  return stub.split("\n").find((l) => /\bdef |\bclass /.test(l) && !l.trim().startsWith("#"))?.trim() ?? sig.kind;
}

// ---- live ------------------------------------------------------------------------------------------

function livePacket(session: SessionRow): Packet {
  if (session.mode !== "interview") throw new ApiError(400, "Live packets are for interviews.");
  const { session: s, state } = settleInterview(session.id);
  if (s.status !== "active") throw new ApiError(409, "This interview has ended; use the grading packet instead.");
  const slug = slugOf(s);
  const pub = getDsa(slug)!.pub;
  const t = loadTemplate("packets/dsa-interview-live.md");
  const markdown = render(t.body, {
    minutes: String(totalMinutes(state.phases)),
    phase_plan: phasePlanText(state.phases),
    title: pub.title,
    statement: pub.statementMd,
    languages: LANGUAGES.map((l) => LANGUAGE_LABELS[l]).join(" or "),
    signature: signatureLine(slug),
  });
  return { kind: "dsa-interview-live", markdown, filename: `swemock-interview-${slug}.md`, versionTag: t.versionTag, sessionId: s.id };
}

// ---- grading ------------------------------------------------------------------------------------------

function dsaGradingPacket(session: SessionRow): Packet {
  if (session.mode !== "interview") throw new ApiError(400, "Grading packets are for interviews.");
  const s = settleInterview(session.id).session;
  if (s.status === "active") throw new ApiError(409, "The grading packet is available after the interview ends.");
  const slug = slugOf(s);
  const pub = getDsa(slug)!.pub;
  const priv = getDsaPrivate(slug)!;
  const m = dsaMetrics(s);
  const all = sessionEvents<Record<string, unknown>>(s.id);

  const timeline = all
    .filter((e) => ["phase_change", "run", "submit", "hint"].includes(e.kind))
    .map((e) => {
      const p = e.payload;
      if (e.kind === "phase_change") return `[${stamp(s, e.ts)}] phase → ${p.to}${p.auto ? " (time)" : ""}`;
      if (e.kind === "hint") return `[${stamp(s, e.ts)}] ${p.nudge ? "interviewer nudge" : `hint ${p.level} revealed`}`;
      return `[${stamp(s, e.ts)}] ${e.kind} (${p.language}): ${String(p.verdict).replace(/_/g, " ")}, ${p.passed}/${p.total}${p.custom ? ", with custom input" : ""}`;
    })
    .join("\n");

  const chat = chatMessages(s.id)
    .filter((c) => c.from !== "system")
    .map((c) => `[${stamp(s, c.ts)}] ${c.from === "interviewer" ? "Interviewer" : "Candidate"}: ${c.text}`);
  const pasted = all.filter((e) => e.kind === "reply_pasted" && e.payload.kind === "dsa-interview-live").map((e) => String(e.payload.text));
  const transcript = [
    ...(chat.length ? chat : []),
    ...(pasted.length ? ["", "Transcript pasted from the external chat:", ...pasted] : []),
  ].join("\n") || "(No conversation was recorded.)";

  const code = latestCode(s);
  const lastSubmit = [...all].reverse().find((e) => e.kind === "submit" || e.kind === "run");
  const finalLanguage = code?.language ?? (lastSubmit?.payload.language as string | undefined) ?? "python";
  const finalCode = code?.code ?? (lastSubmit?.payload.code as string | undefined) ?? "(no code)";

  const metrics = [
    `- Duration: ${Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 60_000)} min; interviewer: ${s.driver === "llm" ? "AI" : readState(s).liveVia === "packet" ? "external chat" : "scripted"}`,
    `- Submissions: ${m.submissions}; best ${m.bestPassed ?? 0}/${m.bestTotal ?? 0} tests passed; ${m.accepted ? `accepted after ${m.minutesToAccept} min` : "never accepted"}`,
    `- Runs before the first submission: ${m.runsBeforeFirstSubmit}; runs with the candidate's own input before acceptance: ${m.customRunsBeforeAccept}`,
    `- Hints and nudges used: ${m.hintsUsed}`,
    m.efficiency ? `- Efficiency of the accepted solution relative to the reference: ${m.efficiency}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const rubric = DSA_INTERVIEW_RUBRIC;
  const t = loadTemplate("packets/dsa-grading.md");
  const markdown = render(t.body, {
    rubric: rubricText(rubric),
    dimension_ids: rubric.dimensions.map((d) => d.id).join(", "),
    title: pub.title,
    difficulty: pub.difficulty,
    statement: pub.statementMd,
    editorial: priv.editorialMd,
    metrics,
    timeline: timeline || "(no events)",
    transcript,
    final_language: finalLanguage === "cpp" ? "cpp" : "python",
    final_code: finalCode,
    example: JSON.stringify(exampleGrade(rubric), null, 2),
  });
  return { kind: "dsa-grading", markdown, filename: `swemock-grading-${slug}.md`, versionTag: t.versionTag, sessionId: s.id };
}

// ---- approach check -------------------------------------------------------------------------------------

type ItemType = "dsa" | "lld";

/** What an approach check needs to know about a problem, whichever kind it is. */
function approachItem(type: ItemType, slug: string): { id: string; title: string; statement: string; secrets: { code: string[]; prose: string[] } } {
  if (type === "lld") {
    const p = getLld(slug);
    if (!p) throw new ApiError(404, "That problem doesn't exist.");
    const priv = getLldPrivate(slug)!;
    return {
      id: p.id,
      title: p.pub.title,
      statement: `${p.pub.specMd}\n\n(This is a low-level design problem: judge the design, meaning the classes, who owns what, and the data structures, not an algorithm.)`,
      secrets: { code: Object.values(priv.languages).flatMap((l) => Object.values(l!.reference)), prose: [priv.designMd] },
    };
  }
  const p = getDsa(slug);
  if (!p) throw new ApiError(404, "That problem doesn't exist.");
  const priv = getDsaPrivate(slug)!;
  return { id: p.id, title: p.pub.title, statement: p.pub.statementMd, secrets: { code: Object.values(priv.references).filter((s): s is string => Boolean(s)), prose: [priv.editorialMd] } };
}

function approachSession(item: { id: string }, type: ItemType, sessionId?: string): SessionRow {
  const existing = sessionId ? getSession(sessionId) : null;
  if (existing && existing.status === "active" && existing.itemId === item.id && existing.mode === "practice") return existing;
  return activePracticeSession(item.id) ?? startSession({ itemId: item.id, mode: "practice", roundType: type });
}

function approachPacket(type: ItemType, slug: string, approach: string, sessionId?: string): Packet {
  if (!approach.trim()) throw new ApiError(400, "Describe your approach first.");
  const item = approachItem(type, slug);
  const session = approachSession(item, type, sessionId);
  const t = loadTemplate("packets/approach-check.md");
  const markdown = render(t.body, { title: item.title, statement: item.statement, approach: approach.trim() });
  return { kind: "approach-check", markdown, filename: `swemock-approach-${slug}.md`, versionTag: t.versionTag, sessionId: session.id };
}

/** The grading packet and rubric for whatever kind of round this session is. */
function gradingFor(session: SessionRow): { packet: Packet; rubric: Rubric } {
  if (session.mode !== "interview") throw new ApiError(400, "Grading packets are for interviews.");
  if (session.roundType === "recruiter") return recruiterGrading(session);
  if (session.roundType === "behavioral") return behavioralGrading(session);
  if (session.roundType === "lld") return lldGrading(session);
  return { packet: dsaGradingPacket(session), rubric: DSA_INTERVIEW_RUBRIC };
}

const GRADING_KINDS: Partial<Record<PacketKind, string>> = { "dsa-grading": "dsa", "recruiter-grading": "recruiter", "behavioral-grading": "behavioral", "lld-grading": "lld" };
const LIVE_KINDS: Partial<Record<PacketKind, string>> = { "dsa-interview-live": "dsa", "recruiter-live": "recruiter", "behavioral-live": "behavioral", "lld-interview-live": "lld" };

function requireRound(session: SessionRow, kind: PacketKind): void {
  const want = GRADING_KINDS[kind] ?? LIVE_KINDS[kind] ?? (kind === "resume-feedback" ? "recruiter" : kind === "behavioral-rewrite" ? "behavioral" : null);
  if (want && session.roundType !== want) throw new ApiError(400, "That packet doesn't belong to this kind of interview.");
}

export function renderPacket(req: { kind: PacketKind; sessionId?: string; slug?: string; approach?: string; itemType?: ItemType }): Packet {
  if (req.kind === "approach-check") {
    if (!req.slug) throw new ApiError(400, "Missing problem.");
    return approachPacket(req.itemType ?? "dsa", req.slug, req.approach ?? "", req.sessionId);
  }
  const session = req.sessionId ? getSession(req.sessionId) : null;
  if (!session) throw new ApiError(404, "Unknown session.");
  requireRound(session, req.kind);
  switch (req.kind) {
    case "dsa-interview-live":
      return livePacket(session);
    case "recruiter-live":
      return recruiterLive(session);
    case "behavioral-live":
      return behavioralLive(session);
    case "lld-interview-live":
      return lldLive(session);
    case "resume-feedback":
      return resumeFeedbackPacket(session);
    case "behavioral-rewrite":
      return rewritePacket(session);
    default:
      return gradingFor(session).packet;
  }
}

/** Every copy and download is logged (spec §2.5). */
export function logPacketAction(sessionId: string, kind: PacketKind, action: "copy" | "download", versionTag: string): void {
  if (!getSession(sessionId)) throw new ApiError(404, "Unknown session.");
  addEvent(sessionId, "packet_copied", { kind, action, version: versionTag });
}

export type PasteResult = { ok: true; scorecard?: ScorecardView; feedback?: unknown } | { ok: false; error: string };

const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.slice(0, 5).map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`).join("; ");

/** A reply pasted back from the chatbot. Grading and feedback replies must end with a valid JSON block. */
export function pasteReply(sessionId: string, kind: PacketKind, text: string): PasteResult {
  const session = getSession(sessionId);
  if (!session) throw new ApiError(404, "Unknown session.");
  if (!text.trim()) throw new ApiError(400, "Paste the reply first.");
  requireRound(session, kind);

  if (GRADING_KINDS[kind]) {
    const { packet, rubric } = gradingFor(session); // also enforces "after the round"
    const block = extractJsonBlock(text);
    let error: string | null = null;
    if (!block.ok) error = block.error;
    else {
      const parsed = aiGradeSchema.safeParse(block.value);
      if (!parsed.success) error = issues(parsed.error);
      else {
        error = checkGradeAgainstRubric(parsed.data, rubric);
        if (!error) {
          addEvent(sessionId, "reply_pasted", { kind, ok: true, text });
          return { ok: true, scorecard: saveAiGrade(sessionId, parsed.data, "pasted", packet.versionTag) };
        }
      }
    }
    addEvent(sessionId, "reply_pasted", { kind, ok: false, text, error });
    return { ok: false, error: error! };
  }

  if (isFeedbackKind(kind)) {
    const s = settleInterview(sessionId).session;
    if (s.status === "active") throw new ApiError(409, "This is available after the interview ends.");
    const block = extractJsonBlock(text);
    let error: string | null = null;
    if (!block.ok) error = block.error;
    else {
      const parsed = FEEDBACK_SCHEMAS[kind].safeParse(block.value);
      if (!parsed.success) error = issues(parsed.error);
      else {
        error = checkFeedback(kind, s, parsed.data);
        if (!error) {
          addEvent(sessionId, "reply_pasted", { kind, ok: true, via: "pasted", text, result: parsed.data });
          return { ok: true, feedback: parsed.data };
        }
      }
    }
    addEvent(sessionId, "reply_pasted", { kind, ok: false, text, error });
    return { ok: false, error: error! };
  }

  // Live transcripts and approach verdicts are stored as text.
  addEvent(sessionId, kind === "approach-check" ? "approach_check" : "reply_pasted", { kind, ok: true, text, via: "pasted" });
  return { ok: true };
}

// ---- connected ----------------------------------------------------------------------------------------

const GRADER_SYSTEM: Record<string, string> = {
  dsa: "You grade mock coding interviews for a hiring committee. Follow the instructions in the user's message exactly.",
  recruiter: "You grade mock recruiter screens for a hiring committee. Follow the instructions in the user's message exactly.",
  lld: "You grade mock low-level design interviews for a hiring committee. Follow the instructions in the user's message exactly.",
  behavioral: "You grade mock behavioral interviews for a hiring committee. Follow the instructions in the user's message exactly.",
};

export async function gradeWithAi(sessionId: string): Promise<ScorecardView> {
  const session = getSession(sessionId);
  if (!session) throw new ApiError(404, "Unknown session.");
  const { packet, rubric } = gradingFor(session);
  const resolved = resolveAi();
  const { value } = await completeJson(
    {
      role: "grader",
      purpose: "grader",
      sessionId,
      system: GRADER_SYSTEM[session.roundType] ?? GRADER_SYSTEM.dsa!,
      messages: [{ role: "user", content: packet.markdown }],
      maxTokens: 8000,
      temperature: 0,
      effort: "medium",
    },
    aiGradeSchema,
    (g) => checkGradeAgainstRubric(g, rubric),
  );
  addEvent(sessionId, "reply_pasted", { kind: packet.kind, ok: true, via: "ai", model: resolved.models.grader });
  return saveAiGrade(sessionId, value, resolved.models.grader || resolved.provider, packet.versionTag);
}

/** Resume feedback (recruiter) or stronger answer versions (behavioral), from the connected model. */
export async function feedbackWithAi(sessionId: string, kind: FeedbackKind): Promise<unknown> {
  const session = getSession(sessionId);
  if (!session) throw new ApiError(404, "Unknown session.");
  requireRound(session, kind);
  const packet = renderPacket({ kind, sessionId });
  const resolved = resolveAi();
  const s = settleInterview(sessionId).session;
  const { value } = await completeJson(
    {
      role: "grader",
      purpose: "feedback",
      sessionId,
      system: "You are a careful career coach. Never invent facts about the candidate. Follow the instructions in the user's message exactly.",
      messages: [{ role: "user", content: packet.markdown }],
      maxTokens: 8000,
      temperature: 0.2,
      effort: "medium",
    },
    FEEDBACK_SCHEMAS[kind],
    (v) => checkFeedback(kind, s, v),
  );
  addEvent(sessionId, "reply_pasted", { kind, ok: true, via: "ai", model: resolved.models.grader, result: value });
  return value;
}

export { storedFeedback };

const APPROACH_SAFE = "Doesn't work as a request: I can only judge an approach, not write or reveal one. Describe your plan in words.";

/** Approach Check (spec §7.8), connected: the fast model gives a verdict and a line of why, never code. */
export async function approachCheck(slug: string, approach: string, sessionId?: string, type: ItemType = "dsa"): Promise<{ sessionId: string; reply: string }> {
  const packet = approachPacket(type, slug, approach, sessionId);
  const secrets = approachItem(type, slug).secrets;
  const reply = await completeText({
    role: "fast",
    purpose: "approach",
    sessionId: packet.sessionId,
    system: "You are a concise senior engineer. Follow the format in the user's message exactly.",
    messages: [{ role: "user", content: packet.markdown }],
    maxTokens: 600,
    temperature: 0,
    effort: "low",
  });
  const filter = buildLeakFilter(secrets, { blockCodeBlocks: true });
  const leaked = filter.check(reply).leaked || /```/.test(reply);
  const text = leaked ? APPROACH_SAFE : reply.trim();
  addEvent(packet.sessionId, "approach_check", { approach: approach.trim(), reply: text, via: "ai", filtered: leaked });
  return { sessionId: packet.sessionId, reply: text };
}
