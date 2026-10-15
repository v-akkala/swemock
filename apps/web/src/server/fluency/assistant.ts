import "server-only";
import { changedNewLines, rankedMutations, shouldMutate, type Language } from "@swemock/shared";
import { ulid } from "ulid";
import type { AssistantTurn, FluencyType, Proposal } from "@/lib/fluency-types";
import { resolveAi } from "../ai/config";
import { completeText } from "../ai/run";
import { getDb } from "../db";
import { addEvent, sessionEvents, type SessionRow } from "../dsa/store";
import { ApiError } from "../http/errors";
import { runProject } from "../judge/client";
import { loadTemplate, render } from "../prompts/templates";
import { readSettings } from "../settings";
import { resolveSession, sanitizeFiles } from "./service";

type Files = Record<string, string>;

export interface ContextItem {
  path: string;
  /** A selection (1-based, inclusive); omitted for the whole file. */
  from?: number;
  to?: number;
}

const SELECTION_CAP = 6000;

function contextText(items: ContextItem[], files: Files): { text: string; logged: { path: string; from?: number; to?: number; text: string | null }[] } {
  const parts: string[] = [];
  const logged: { path: string; from?: number; to?: number; text: string | null }[] = [];
  for (const it of items.slice(0, 8)) {
    const full = files[it.path];
    if (full === undefined) continue;
    const selection = it.from ? full.split("\n").slice(it.from - 1, it.to ?? it.from).join("\n").slice(0, SELECTION_CAP) : null;
    parts.push(`### ${it.path}${it.from ? ` (lines ${it.from}–${it.to ?? it.from})` : ""}\n\`\`\`\n${selection ?? full}\n\`\`\``);
    logged.push({ path: it.path, from: it.from, to: it.to, text: selection });
  }
  return { text: parts.join("\n\n") || "(nothing attached)", logged };
}

export function renderAskPacket(question: string, context: string): { markdown: string; versionTag: string } {
  const t = loadTemplate("packets/assistant-ask.md");
  return { markdown: render(t.body, { question: question.trim(), context }), versionTag: t.versionTag };
}

export interface AskRequest {
  type: FluencyType;
  slug: string;
  sessionId?: string;
  question: string;
  context: ContextItem[];
  files: Files;
}

/**
 * The assistant panel (spec §8.4). With a model configured the `assistant` role answers in the panel;
 * otherwise the user gets a packet for any chatbot and pastes the reply back. Every prompt is logged.
 */
export async function askAssistant(req: AskRequest): Promise<AssistantTurn> {
  const { pub, session, type } = resolveSession(req.type, req.slug, req.sessionId);
  const files = sanitizeFiles(type, pub, req.files);
  const ctx = contextText(req.context, files);
  const promptId = ulid();
  const ai = resolveAi();
  addEvent(session.id, "assistant_prompt", { promptId, question: req.question.trim().slice(0, 4000), context: ctx.logged, via: ai.connected ? "ai" : "packet" });

  if (!ai.connected) {
    const { markdown, versionTag } = renderAskPacket(req.question, ctx.text);
    addEvent(session.id, "packet_copied", { kind: "assistant-ask", action: "compose", version: versionTag, promptId });
    return { promptId, reply: null, packet: markdown, proposals: [] };
  }
  const t = loadTemplate("assistant/fluency.md");
  const reply = await completeText({
    role: "assistant",
    purpose: "assistant",
    sessionId: session.id,
    system: t.body,
    context: `Attached context:\n${ctx.text}`,
    messages: [{ role: "user", content: req.question.trim() }],
    maxTokens: 6000,
    temperature: 0.2,
    effort: "medium",
  });
  return processReply({ session, type, language: pub.language, promptId, reply, files, activePath: null, via: "ai" });
}

/** A reply pasted back from another assistant. */
export async function pasteAssistantReply(req: { type: FluencyType; slug: string; sessionId?: string; promptId?: string; text: string; files: Files; activePath?: string | null }): Promise<AssistantTurn> {
  const { pub, session, type } = resolveSession(req.type, req.slug, req.sessionId);
  if (!req.text.trim()) throw new ApiError(400, "Paste the reply first.");
  const files = sanitizeFiles(type, pub, req.files);
  return processReply({ session, type, language: pub.language, promptId: req.promptId ?? ulid(), reply: req.text, files, activePath: req.activePath ?? null, via: "pasted" });
}

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

/** Code blocks of a reply that name a file (info string `path=…`, or a first-line `# path: …` comment). */
export function extractBlocks(reply: string, activePath: string | null, known: (p: string) => boolean): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const all = [...reply.matchAll(FENCE)];
  for (const m of all) {
    const info = m[1]!.trim();
    let content = m[2]!;
    let path = /(?:^|\s)(?:path|file|filename)=["']?([\w./-]+)["']?/.exec(info)?.[1] ?? /^[\w.-]+(?:\/[\w.-]+)*\.\w+$/.exec(info.split(/\s+/).at(-1) ?? "")?.[0] ?? null;
    if (!path) {
      const first = /^\s*(?:#|\/\/|\/\*)\s*(?:path|file|filename):\s*([\w./-]+)/.exec(content);
      if (first) {
        path = first[1]!;
        content = content.replace(/^[^\n]*\n/, "");
      }
    }
    if (!path && activePath && all.length === 1) path = activePath;
    if (path && known(path)) out.push({ path, content: content.replace(/\n$/, "") });
  }
  return out;
}

async function parses(language: Language, path: string, files: Files): Promise<boolean> {
  const cmd = language === "python" ? `python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" ${path}` : `g++ -std=c++20 -fsyntax-only -I. ${path}`;
  const r = await runProject({ language, files, command: { kind: "shell", cmd }, timeoutMs: 30_000 });
  return r.exitCode === 0;
}

const isSource = (language: Language, path: string) => (language === "python" ? path.endsWith(".py") : /\.(cpp|hpp|h)$/.test(path));

/** One in five; in test mode every code-producing reply (when the flag is on), so end-to-end tests are deterministic. */
function mutationRate(): number {
  if (process.env.SWEMOCK_TEST_MODE !== "1") return 0.2;
  const set = Number(process.env.SWEMOCK_FALLIBLE_RATE);
  return process.env.SWEMOCK_FALLIBLE_RATE && Number.isFinite(set) ? set : 1;
}

async function processReply(o: { session: SessionRow; type: FluencyType; language: Language; promptId: string; reply: string; files: Files; activePath: string | null; via: "ai" | "pasted" }): Promise<AssistantTurn> {
  const { session, language, files } = o;
  const blocks = extractBlocks(o.reply, o.activePath, (p) => p in files || /\.(py|cpp|hpp|h)$/.test(p));
  // A fenced block ends without the file's final newline; keep the file's own ending so the diff has no phantom hunk.
  const withEnding = (base: string, content: string) => (base.endsWith("\n") && !content.endsWith("\n") ? `${content}\n` : content);
  const proposals: Proposal[] = blocks.map((b, i) => ({ id: `${o.promptId}-${i + 1}`, path: b.path, base: files[b.path] ?? "", newContent: withEnding(files[b.path] ?? "", b.content) }));

  // Fallible mode: about one code-producing reply in five gets one hidden mutation before the diff preview.
  let mutation: { proposalId: string; path: string; op: string; line: number; before: string; after: string } | null = null;
  if (proposals.length && readSettings(getDb()).features.fallibleMode && shouldMutate(`${session.id}:${o.promptId}`, mutationRate())) {
    outer: for (const p of proposals.filter((x) => isSource(language, x.path) && x.newContent !== x.base)) {
      const changed = changedNewLines(p.base, p.newContent);
      for (const m of rankedMutations(p.newContent, language, `${session.id}:${o.promptId}:${p.path}`, changed)) {
        if (await parses(language, p.path, { ...files, [p.path]: m.text })) {
          mutation = { proposalId: p.id, path: p.path, op: m.op, line: m.line, before: m.before, after: m.after };
          p.newContent = m.text;
          break outer;
        }
      }
    }
  }

  addEvent(session.id, "assistant_response", {
    promptId: o.promptId,
    via: o.via,
    reply: o.reply.slice(0, 20_000),
    // Logged server-side only (it contains any hidden mutation); the debrief reads it.
    proposals: proposals.map((p) => ({ id: p.id, path: p.path, base: p.base, newContent: p.newContent })),
  });
  if (mutation) addEvent(session.id, "mutation_injected", { promptId: o.promptId, ...mutation });
  return { promptId: o.promptId, reply: o.reply, packet: null, proposals };
}

/** The candidate accepted or rejected hunks of a proposal (the diff preview). */
export function logApply(req: { type: FluencyType; slug: string; sessionId?: string; proposalId: string; path: string; accepted: string[]; rejected: string[] }): void {
  const { session } = resolveSession(req.type, req.slug, req.sessionId);
  addEvent(session.id, "assistant_apply", { proposalId: req.proposalId, path: req.path, accepted: req.accepted, rejected: req.rejected });
}

export const assistantEvents = (sessionId: string) => ({
  prompts: sessionEvents<Record<string, unknown>>(sessionId, "assistant_prompt"),
  responses: sessionEvents<Record<string, unknown>>(sessionId, "assistant_response"),
  applies: sessionEvents<Record<string, unknown>>(sessionId, "assistant_apply"),
  mutations: sessionEvents<Record<string, unknown>>(sessionId, "mutation_injected"),
});
