import "server-only";
import { LANGUAGE_LABELS, LANGUAGES, generateStub } from "@swemock/shared";
import { DSA_INTERVIEW_RUBRIC, aiGradeSchema, checkGradeAgainstRubric, exampleGrade, extractJsonBlock, type Rubric } from "@swemock/shared/scoring";
import { getDsa, getDsaPrivate } from "./content/repo";
import { ApiError } from "./http/errors";
import { buildLeakFilter } from "./ai/leak-filter";
import { completeJson, completeText } from "./ai/run";
import { resolveAi } from "./ai/config";
import { addEvent, getSession, sessionEvents, startSession, activePracticeSession, type SessionRow } from "./dsa/store";
import { chatMessages, latestCode, settleInterview } from "./interview/engine";
import { phasePlanText, totalMinutes } from "./interview/phases";
import { readState } from "./interview/state";
import { loadTemplate, render } from "./prompts/templates";
import { dsaMetrics, saveAiGrade, type ScorecardView } from "./scoring/scorecard";

/**
 * Copy-prompt packets (spec §2.4–2.5): self-contained markdown a user pastes into any chatbot.
 * Live packets carry only what the candidate may see. Grading packets exist only after the round ends.
 */
export const PACKET_KINDS = ["dsa-interview-live", "dsa-grading", "approach-check"] as const;
export type PacketKind = (typeof PACKET_KINDS)[number];

export interface Packet {
  kind: PacketKind;
  markdown: string;
  filename: string;
  versionTag: string;
  sessionId: string;
}

function slugOf(session: SessionRow): string {
  if (!session.itemId) throw new ApiError(400, "This session has no problem.");
  return session.itemId.split(":")[1]!;
}

function signatureLine(slug: string): string {
  const sig = getDsa(slug)!.pub.signature;
  const stub = generateStub(sig, "python");
  return stub.split("\n").find((l) => /\bdef |\bclass /.test(l) && !l.trim().startsWith("#"))?.trim() ?? sig.kind;
}

function stamp(session: SessionRow, ts: number): string {
  const s = Math.max(0, Math.floor((ts - session.startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function rubricText(rubric: Rubric): string {
  return rubric.dimensions
    .map(
      (d) =>
        `### ${d.label} (id: \`${d.id}\`)\n${d.description}\n` +
        d.anchors.map((a, i) => `- **${i + 1}**: ${a}`).join("\n"),
    )
    .join("\n\n");
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

function gradingPacket(session: SessionRow): Packet {
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

function approachSession(slug: string, sessionId?: string): SessionRow {
  const problem = getDsa(slug);
  if (!problem) throw new ApiError(404, "That problem doesn't exist.");
  const existing = sessionId ? getSession(sessionId) : null;
  if (existing && existing.status === "active" && existing.itemId === problem.id && existing.mode === "practice") return existing;
  return activePracticeSession(problem.id) ?? startSession({ itemId: problem.id, mode: "practice" });
}

function approachPacket(slug: string, approach: string, sessionId?: string): Packet {
  if (!approach.trim()) throw new ApiError(400, "Describe your approach first.");
  const session = approachSession(slug, sessionId);
  const pub = getDsa(slug)!.pub;
  const t = loadTemplate("packets/approach-check.md");
  const markdown = render(t.body, { title: pub.title, statement: pub.statementMd, approach: approach.trim() });
  return { kind: "approach-check", markdown, filename: `swemock-approach-${slug}.md`, versionTag: t.versionTag, sessionId: session.id };
}

export function renderPacket(req: { kind: PacketKind; sessionId?: string; slug?: string; approach?: string }): Packet {
  if (req.kind === "approach-check") {
    if (!req.slug) throw new ApiError(400, "Missing problem.");
    return approachPacket(req.slug, req.approach ?? "", req.sessionId);
  }
  const session = req.sessionId ? getSession(req.sessionId) : null;
  if (!session) throw new ApiError(404, "Unknown session.");
  return req.kind === "dsa-interview-live" ? livePacket(session) : gradingPacket(session);
}

/** Every copy and download is logged (spec §2.5). */
export function logPacketAction(sessionId: string, kind: PacketKind, action: "copy" | "download", versionTag: string): void {
  if (!getSession(sessionId)) throw new ApiError(404, "Unknown session.");
  addEvent(sessionId, "packet_copied", { kind, action, version: versionTag });
}

export type PasteResult = { ok: true; scorecard?: ScorecardView } | { ok: false; error: string };

/** A reply pasted back from the chatbot. Grading replies must end with a valid JSON block. */
export function pasteReply(sessionId: string, kind: PacketKind, text: string): PasteResult {
  const session = getSession(sessionId);
  if (!session) throw new ApiError(404, "Unknown session.");
  if (!text.trim()) throw new ApiError(400, "Paste the reply first.");

  if (kind === "dsa-grading") {
    const packet = gradingPacket(session); // also enforces "after the round"
    const block = extractJsonBlock(text);
    let error: string | null = null;
    if (!block.ok) error = block.error;
    else {
      const parsed = aiGradeSchema.safeParse(block.value);
      if (!parsed.success) error = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      else {
        error = checkGradeAgainstRubric(parsed.data, DSA_INTERVIEW_RUBRIC);
        if (!error) {
          addEvent(sessionId, "reply_pasted", { kind, ok: true, text });
          return { ok: true, scorecard: saveAiGrade(sessionId, parsed.data, "pasted", packet.versionTag) };
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

export async function gradeWithAi(sessionId: string): Promise<ScorecardView> {
  const session = getSession(sessionId);
  if (!session) throw new ApiError(404, "Unknown session.");
  const packet = gradingPacket(session);
  const resolved = resolveAi();
  const { value } = await completeJson(
    {
      role: "grader",
      purpose: "grader",
      sessionId,
      system: "You grade mock coding interviews for a hiring committee. Follow the instructions in the user's message exactly.",
      messages: [{ role: "user", content: packet.markdown }],
      maxTokens: 8000,
      temperature: 0,
      effort: "medium",
    },
    aiGradeSchema,
    (g) => checkGradeAgainstRubric(g, DSA_INTERVIEW_RUBRIC),
  );
  addEvent(sessionId, "reply_pasted", { kind: "dsa-grading", ok: true, via: "ai", model: resolved.models.grader });
  return saveAiGrade(sessionId, value, resolved.models.grader || resolved.provider, packet.versionTag);
}

const APPROACH_SAFE = "Doesn't work as a request: I can only judge an approach, not write or reveal one. Describe your plan in words.";

/** Approach Check (spec §7.8), connected: the fast model gives a verdict and a line of why, never code. */
export async function approachCheck(slug: string, approach: string, sessionId?: string): Promise<{ sessionId: string; reply: string }> {
  const packet = approachPacket(slug, approach, sessionId);
  const priv = getDsaPrivate(slug)!;
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
  const filter = buildLeakFilter({ code: Object.values(priv.references).filter((s): s is string => Boolean(s)), prose: [priv.editorialMd] }, { blockCodeBlocks: true });
  const leaked = filter.check(reply).leaked || /```/.test(reply);
  const text = leaked ? APPROACH_SAFE : reply.trim();
  addEvent(packet.sessionId, "approach_check", { approach: approach.trim(), reply: text, via: "ai", filtered: leaked });
  return { sessionId: packet.sessionId, reply: text };
}
