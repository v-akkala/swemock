import "server-only";
import { generateStub } from "@swemock/shared";
import { getDsa, getDsaPrivate } from "../content/repo";
import { buildLeakFilter } from "../ai/leak-filter";
import { streamText } from "../ai/run";
import { AiError, type ChatMessage } from "../ai/types";
import { addEvent, getSession, type SessionRow } from "../dsa/store";
import { loadTemplate, render } from "../prompts/templates";
import { lineDiff } from "./diff";
import { chatMessages, latestCode, latestJudgeResult, requireActive, type ChatPayload } from "./engine";
import { phasePlanText, totalMinutes } from "./phases";
import { readState, writeState, type InterviewState } from "./state";

const NUDGE = "<<nudge>>";
/**
 * Text is released to the browser only once it's this far behind the newest token, so the leak filter has
 * seen enough context (two 8-token code shingles or a 10-word prose shingle) before anything that might be
 * hidden content leaves the server. Text inside an unclosed code fence is held back entirely.
 */
const HOLDBACK = 160;

/** How much of `text` is safe to show: everything except the look-behind window and any open code fence. */
export function releasable(text: string): number {
  let safe = Math.max(0, text.length - HOLDBACK);
  const fences = [...text.matchAll(/```/g)];
  if (fences.length % 2 === 1) safe = Math.min(safe, fences[fences.length - 1]!.index!);
  return safe;
}
const SAFE_REPLY = "I can't give that part away, but you're welcome to talk me through your current idea and I'll react to it.";

export type InterviewerEvent =
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; id: string | null }
  | { type: "error"; kind: string; message: string };

/** The cached part of the prompt: identical bytes for every turn of a session. */
function systemPrompt(session: SessionRow, state: InterviewState): { text: string; versionTag: string } {
  const slug = session.itemId!.split(":")[1]!;
  const pub = getDsa(slug)!.pub;
  const priv = getDsaPrivate(slug)!;
  const t = loadTemplate("interviewer/dsa-system.md");
  const text = render(t.body, {
    minutes: String(totalMinutes(state.phases)),
    persona_suffix: "",
    mode_rules:
      "This is interview mode: never give answers or approaches. Nudge only when the candidate is clearly stuck, keep nudges small, and mark each one.",
    title: pub.title,
    statement: pub.statementMd,
    signature: generateStub(pub.signature, "python").split("\n").find((l) => l.includes("def ") || l.includes("class ")) ?? pub.signature.kind,
    editorial: priv.editorialMd,
    reference_python: priv.references.python ?? "",
    hints: priv.hints.map((h, i) => `${i + 1}. ${h}`).join("\n"),
    followups: priv.followups.map((f) => `- ${f}`).join("\n"),
    hidden_test_kinds: [...new Set(priv.hiddenTests.map((h) => h.kind))].join(", "),
    phase_plan: phasePlanText(state.phases),
  });
  return { text, versionTag: t.versionTag };
}

/** The per-turn note: time, phase, what changed in the code, the latest test result. */
function turnContext(session: SessionRow, state: InterviewState, now: number): { text: string; code: string | null } {
  const phase = state.phases[state.phaseIndex]!;
  const elapsed = Math.floor((now - session.startedAt) / 60_000);
  const phaseLeft = Math.max(0, Math.ceil((state.phaseStartedAt + phase.minutes * 60_000 - now) / 60_000));
  const totalLeft = Math.max(0, Math.ceil((state.deadline - now) / 60_000));
  const code = latestCode(session);
  const lines = [
    "<context>",
    `Elapsed: ${elapsed} min. Current phase: ${phase.label} (${phaseLeft} min left in this phase, ${totalLeft} min left overall).`,
  ];
  if (code) {
    const changed = state.llmCodeBaseline === null ? code.code : lineDiff(state.llmCodeBaseline, code.code);
    lines.push(
      state.llmCodeBaseline === null
        ? `Candidate's code (${code.language}):\n${code.code.slice(0, 2500)}`
        : state.llmCodeBaseline === code.code
          ? "The code hasn't changed since your last reply."
          : `Code changes since your last reply (${code.language}):\n${changed}`,
    );
  }
  const judged = latestJudgeResult(session.id);
  if (judged) lines.push(`Latest test result: ${judged}.`);
  lines.push("</context>");
  return { text: lines.join("\n"), code: code?.code ?? null };
}

function transcript(sessionId: string): ChatMessage[] {
  return chatMessages(sessionId)
    .filter((m) => m.from !== "system")
    .map((m) => ({ role: m.from === "interviewer" ? "assistant" : "user", content: m.text }));
}

/**
 * The candidate said something to the AI interviewer: log it, stream the reply through the leak filter,
 * and record the reply (and any nudge) when it's complete.
 */
export async function* interviewerReply(sessionId: string, text: string, signal?: AbortSignal): AsyncGenerator<InterviewerEvent> {
  const now = Date.now();
  const { session, state } = requireActive(sessionId, now);
  const phaseId = state.phases[state.phaseIndex]!.id;
  addEvent(session.id, "chat", { from: "candidate", text, phase: phaseId } satisfies ChatPayload, now);

  const slug = session.itemId!.split(":")[1]!;
  const priv = getDsaPrivate(slug)!;
  const filter = buildLeakFilter(
    { code: Object.values(priv.references).filter((s): s is string => Boolean(s)), prose: [priv.editorialMd, ...priv.hints.slice(2)] },
    { blockCodeBlocks: true },
  );
  const system = systemPrompt(session, state);
  const context = turnContext(session, state, now);

  let full = "";
  let sent = 0;
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort());
  try {
    for await (const chunk of streamText({
      role: "interviewer",
      purpose: "interviewer",
      sessionId,
      system: system.text,
      context: context.text,
      messages: transcript(sessionId),
      maxTokens: 2000,
      temperature: 0.4,
      effort: "low",
      signal: controller.signal,
    })) {
      full += chunk;
      const check = filter.check(full);
      if (check.leaked) {
        controller.abort();
        addEvent(session.id, "chat", { from: "interviewer", text: SAFE_REPLY, phase: phaseId, filtered: true, blockedReason: check.reason! } satisfies ChatPayload);
        yield { type: "replace", text: SAFE_REPLY };
        yield { type: "done", id: null };
        return;
      }
      const visible = full.replaceAll(NUDGE, "").trimStart();
      const upTo = releasable(visible);
      if (upTo > sent) {
        yield { type: "delta", text: visible.slice(sent, upTo) };
        sent = upTo;
      }
    }
  } catch (e) {
    if (controller.signal.aborted && !signal?.aborted) return;
    const err = e instanceof AiError ? e : new AiError("unavailable", e instanceof Error ? e.message : String(e));
    yield { type: "error", kind: err.kind, message: err.message };
    return;
  }

  const nudged = full.includes(NUDGE);
  const finalText = full.replaceAll(NUDGE, "").trim();
  // The whole reply passed the filter: release what was held back.
  const visible = full.replaceAll(NUDGE, "").trimStart();
  if (visible.length > sent) yield { type: "delta", text: visible.slice(sent) };
  if (nudged) addEvent(session.id, "hint", { slug, level: 0, source: "interviewer", nudge: true, text: finalText });
  addEvent(session.id, "chat", { from: "interviewer", text: finalText, phase: phaseId } satisfies ChatPayload);
  const latest = readState(getSession(session.id)!);
  latest.llmCodeBaseline = context.code;
  writeState(session.id, latest);
  yield { type: "done", id: null };
}
