import "server-only";
import type { FluencyType } from "@/lib/fluency-types";
import { getFluency, getFluencyPrivate, type PrivateOf, type PublicOf } from "../content/fluency";

const fence = (lang: string, text: string) => `\`\`\`${lang === "cpp" ? "cpp" : "python"}\n${text.trimEnd()}\n\`\`\``;
const listing = (files: Record<string, string>, lang: string, limit = 40_000) => {
  let used = 0;
  return Object.entries(files)
    .map(([p, t]) => {
      used += t.length;
      return used > limit ? `**${p}** (${t.split("\n").length} lines, omitted here)` : `**${p}**\n${fence(lang, t)}`;
    })
    .join("\n\n");
};

export const ROUND_NAME: Record<FluencyType, string> = { comprehension: "code comprehension", review: "AI-generated code review", extension: "feature extension" };

export const ROUND_RULES: Record<FluencyType, string> = {
  comprehension:
    "Orientation: ask for a summary of the system. Bug hunt: stay mostly quiet; ask how they are searching and how they would confirm a suspicion, and push back on vague findings. Design: ask the authored design questions one at a time and ask for arguments on both sides. Wrap-up: ask which improvement they would make first and why.",
  review:
    "Introductions: confirm they know what to do. Review: stay mostly quiet; ask what they checked and why they trust or doubt the tests and the description. Decision: ask for the decision and which comments are blocking, and probe over-flagging or under-flagging. Some pull requests are fine: do not hint either way.",
  extension:
    "Plan: ask which files they will touch and how they will check for regressions. Implementation: stay mostly quiet; ask what they check before accepting assistant code. Verification: ask what the test results tell them and which tests they added. Wrap-up: ask them to walk through the change and what they would still improve.",
};

/** What the candidate sees, as text (for prompts and packets). */
export function describeVisible(type: FluencyType, slug: string): string {
  const item = getFluency(type, slug)!;
  const lang = item.pub.language;
  if (type === "comprehension") {
    const pub = item.pub as PublicOf["comprehension"];
    return `### ${pub.title}\n\n${pub.brief}\n\nFiles (${Object.keys(pub.files).length}):\n\n${listing(pub.files, lang)}`;
  }
  if (type === "review") {
    const pub = item.pub as PublicOf["review"];
    const changed = Object.keys(pub.head).filter((p) => pub.head[p] !== pub.base[p]);
    return `### Pull request: ${pub.pr.title}\n\n${pub.pr.description}\n\nChanged files: ${changed.join(", ")}\n\n${listing(Object.fromEntries(changed.map((p) => [p, pub.head[p]!])), lang)}`;
  }
  const pub = item.pub as PublicOf["extension"];
  const code = Object.fromEntries(Object.entries(pub.files).filter(([p]) => !p.startsWith("tests/")));
  return `### ${pub.title}\n\n${pub.ticketMd}\n\nRepository files: ${Object.keys(pub.files).join(", ")}\n\n${pub.files["CONVENTIONS.md"] ?? ""}\n\n${listing(code, lang, 20_000)}`;
}

/** What only the interviewer and grader know. */
export function describeHidden(type: FluencyType, slug: string): string {
  const priv = getFluencyPrivate(type, slug)!;
  if (type === "comprehension") {
    const m = (priv as PrivateOf["comprehension"]).manifest;
    return [
      "Planted bugs:",
      ...m.bugs.map((b) => `- [${b.id}] ${b.file}:${b.lines[0]}-${b.lines[1]} (${b.category}, ${b.severity}) ${b.title}: ${b.explanation}`),
      "",
      "Debatable design decisions:",
      ...m.decisions.map((d) => `- ${d.title}. For: ${d.for} Against: ${d.against}`),
      "",
      "Improvement opportunities:",
      ...m.improvements.map((i) => `- ${i}`),
      "",
      "Acceptable findings (real, not planted; don't count against precision):",
      ...(m.acceptable.length ? m.acceptable.map((a) => `- ${a.file}:${a.lines[0]}-${a.lines[1]} ${a.note}`) : ["- (none)"]),
      "",
      "Authored design questions:",
      ...m.questions.map((q) => `- ${q}`),
    ].join("\n");
  }
  if (type === "review") {
    const p = priv as PrivateOf["review"];
    return [
      `The right decision: ${p.decision.replace("_", " ")}${p.decision === "approve" ? " (a correct PR; flagging blocking problems is over-flagging; nits are fine)" : ""}.`,
      "Seeded issues:",
      ...(p.issues.length ? p.issues.map((i) => `- [${i.id}] ${i.file}:${i.lines[0]}-${i.lines[1]} (${i.category}, ${i.severity}) ${i.title}: ${i.explanation}`) : ["- (none)"]),
      "",
      "Questions:",
      ...p.questions.map((q) => `- ${q}`),
    ].join("\n");
  }
  const p = priv as PrivateOf["extension"];
  return ["Reference implementation (changed or added files):", ...Object.entries(p.reference).map(([f, t]) => `### ${f}\n${t}`), "", "Questions:", ...p.questions.map((q) => `- ${q}`)].join("\n");
}
