import "server-only";
import { LANGUAGE_LABELS, type Language } from "@swemock/shared";
import { LLD_RUBRIC, exampleGrade, type Rubric } from "@swemock/shared/scoring";
import { getLld, getLldPrivate } from "./content/lld";
import { sessionEvents, type SessionRow } from "./dsa/store";
import { ApiError } from "./http/errors";
import { settleInterview } from "./interview/engine";
import { phasePlanText, totalMinutes } from "./interview/phases";
import { readState } from "./interview/state";
import { latestLldFiles } from "./lld/store";
import { rubricText, stamp, type Packet } from "./packet-util";
import { loadTemplate, render } from "./prompts/templates";
import { loadScorecard } from "./scoring/scorecard";
import { transcriptOf } from "./packets-conversation";

const slugOf = (s: SessionRow) => s.itemId!.split(":")[1]!;

const fence = (lang: string, text: string) => `\`\`\`${lang === "cpp" ? "cpp" : "python"}\n${text.trimEnd()}\n\`\`\``;

export function lldLive(session: SessionRow): Packet {
  const { session: s, state } = settleInterview(session.id);
  if (s.status !== "active") throw new ApiError(409, "This interview has ended; use the grading packet instead.");
  const slug = slugOf(s);
  const pub = getLld(slug)!.pub;
  const priv = getLldPrivate(slug)!;
  const provided = Object.entries(pub.languages)
    .map(([lang, l]) => `#### ${LANGUAGE_LABELS[lang as Language]}\n` + l!.files.map((f) => `**${f.path}** (${f.role === "provided" ? "provided: you may read and, carefully, edit it" : "yours to write"})\n${fence(lang, f.content)}`).join("\n\n"))
    .join("\n\n");
  const t = loadTemplate("packets/lld-interview-live.md");
  const markdown = render(t.body, {
    minutes: String(totalMinutes(state.phases)),
    phase_plan: phasePlanText(state.phases),
    title: pub.title,
    format: pub.format === "system" ? "complete the system" : "implement the class",
    spec: `${pub.specMd}\n\n### Starting code\n\n${provided}`,
    change: priv.changeMd.trim().replace(/\n+/g, " "),
  });
  return { kind: "lld-interview-live", markdown, filename: `swemock-lld-${slug}.md`, versionTag: t.versionTag, sessionId: s.id };
}

export function lldGrading(session: SessionRow): { packet: Packet; rubric: Rubric } {
  const s = settleInterview(session.id).session;
  if (s.status === "active") throw new ApiError(409, "The grading packet is available after the interview ends.");
  const slug = slugOf(s);
  const pub = getLld(slug)!.pub;
  const priv = getLldPrivate(slug)!;
  const all = sessionEvents<Record<string, unknown>>(s.id);
  const card = loadScorecard(s.id);

  const saved = latestLldFiles(s.id);
  const lastSubmit = [...all].reverse().find((e) => e.kind === "submit" || e.kind === "run");
  const language = (saved?.language ?? (lastSubmit?.payload.language as Language | undefined) ?? (Object.keys(pub.languages)[0] as Language)) as Language;
  const finalFiles = (lastSubmit?.payload.files as Record<string, string> | undefined) ?? saved?.files ?? {};
  const spec = pub.languages[language]!;
  const reference = priv.languages[language]?.reference ?? {};

  const best = [...all].filter((e) => e.kind === "submit").sort((a, b) => Number((b.payload.counts as Record<string, { passed: number }>)?.core?.passed ?? 0) - Number((a.payload.counts as Record<string, { passed: number }>)?.core?.passed ?? 0))[0];
  const results = best
    ? Object.entries(best.payload.counts as Record<string, { passed: number; total: number }>)
        .filter(([, v]) => v.total)
        .map(([k, v]) => `- ${k}: ${v.passed}/${v.total} passed`)
        .join("\n")
    : "(no submission)";

  const timeline = all
    .filter((e) => ["phase_change", "run", "submit", "hint", "requirement_change"].includes(e.kind))
    .map((e) => {
      const p = e.payload;
      if (e.kind === "phase_change") return `[${stamp(s, e.ts)}] phase → ${p.to}${p.auto ? " (time)" : ""}`;
      if (e.kind === "requirement_change") return `[${stamp(s, e.ts)}] new requirement introduced`;
      if (e.kind === "hint") return `[${stamp(s, e.ts)}] ${p.nudge ? "interviewer nudge" : `hint ${p.level} revealed`}`;
      return `[${stamp(s, e.ts)}] ${e.kind} (${p.language}): ${String(p.verdict).replace(/_/g, " ")}, ${p.passed}/${p.total}${p.extension ? ", with extension tests" : ""}`;
    })
    .join("\n");

  const edits = spec.files
    .filter((f) => f.role === "provided")
    .map((f) => {
      const now = finalFiles[f.path] ?? f.content;
      return now === f.content ? `**${f.path}**: unchanged.` : `**${f.path}** was edited. Original:\n${fence(language, f.content)}\nFinal:\n${fence(language, now)}`;
    })
    .join("\n\n") || "(no provided file in this problem)";

  const header = `- Duration: ${Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 60_000)} min; interviewer: ${s.driver === "llm" ? "AI" : readState(s).liveVia === "packet" ? "external chat" : "scripted"}`;
  const t = loadTemplate("packets/lld-grading.md");
  const markdown = render(t.body, {
    rubric: rubricText(LLD_RUBRIC),
    dimension_ids: LLD_RUBRIC.dimensions.map((d) => d.id).join(", "),
    title: pub.title,
    format: pub.format === "system" ? "complete the system" : "implement the class",
    difficulty: pub.difficulty,
    spec: pub.specMd,
    change: priv.changeMd,
    design: priv.designMd,
    language: LANGUAGE_LABELS[language],
    reference: Object.entries(reference).map(([p, text]) => `**${p}**\n${fence(language, text)}`).join("\n\n") || "(none)",
    metrics: [header, ...card.metricLines.map((l) => `- ${l}`)].join("\n"),
    results,
    timeline: timeline || "(no events)",
    transcript: transcriptOf(s, "lld-interview-live"),
    edits,
    final_code: Object.entries(finalFiles).map(([p, text]) => `**${p}**\n${fence(language, text)}`).join("\n\n") || "(no code)",
    example: JSON.stringify(exampleGrade(LLD_RUBRIC), null, 2),
  });
  return { packet: { kind: "lld-grading", markdown, filename: `swemock-lld-grading-${slug}.md`, versionTag: t.versionTag, sessionId: s.id }, rubric: LLD_RUBRIC };
}
