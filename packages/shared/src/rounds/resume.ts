/**
 * Deterministic resume parsing (spec §8.1 "Without AI"): sections, entries, and bullets, plus the flags a
 * recruiter would probe: numbers and metrics, strong claims, buzzwords, vague wording. No model involved,
 * so the scripted recruiter works with provider `none`.
 */
export type SectionKind = "summary" | "education" | "experience" | "projects" | "skills" | "other";
export type BulletFlag = "metric" | "number" | "strong-claim" | "buzzword" | "vague";

export interface ResumeBullet {
  text: string;
  section: string;
  entry: string | null;
  flags: BulletFlag[];
  /** Higher = more worth a recruiter's follow-up. */
  score: number;
}

export interface ResumeEntry {
  title: string;
  dates: string | null;
  bulletCount: number;
}

export interface ResumeSection {
  heading: string;
  kind: SectionKind;
  entries: ResumeEntry[];
  bullets: ResumeBullet[];
}

export interface ParsedResume {
  name: string | null;
  sections: ResumeSection[];
  bullets: ResumeBullet[];
  skills: string[];
  /** The 2–3 bullets to deep-dive on. */
  probes: ResumeBullet[];
}

const HEADINGS: [RegExp, SectionKind][] = [
  [/^(?:professional |work |relevant )?experience$|^employment(?: history)?$|^work history$|^internships?$|^industry experience$/, "experience"],
  [/^(?:personal |academic |selected |technical |side )?projects?$|^open[- ]source(?: contributions)?$/, "projects"],
  [/^education(?:al background)?$|^academics?$|^coursework$/, "education"],
  [/^(?:technical )?skills?(?: (?:&|and) .*)?$|^technologies$|^tech stack$|^languages (?:&|and) (?:tools|frameworks)$/, "skills"],
  [/^(?:professional )?summary$|^profile$|^objective$|^about(?: me)?$/, "summary"],
  [/^publications?$|^research(?: experience)?$|^awards?(?: (?:&|and) honors)?$|^honors$|^certifications?$|^leadership(?: (?:&|and) activities)?$|^activities$|^extracurriculars?$|^volunteer(?:ing)?(?: experience)?$|^achievements$/, "other"],
];

const BULLET_MARK = /^\s*(?:[•·▪▫◦●○■□‣⁃*+\-–—]|\d{1,2}[.)])\s+(.*\S)\s*$/;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_RANGE = new RegExp(
  `(?:${MONTH}\\s+)?(?:19|20)\\d{2}\\s*(?:[-–—]|to)\\s*(?:present|current|now|(?:${MONTH}\\s+)?(?:19|20)\\d{2})`,
  "i",
);

const METRIC =
  /\d[\d,.]*\s*(?:%|×|x\b|k\b|m\b|b\b|ms\b|qps\b|rps\b|\+|users?\b|customers?\b|requests?\b|engineers?\b|million|billion|thousand|hours?\b|minutes?\b|days?\b|weeks?\b)|[$€£]\s?\d|\b(?:doubled|tripled|halved)\b/i;
const NUMBER = /\d/;
const YEAR = /\b(?:19|20)\d{2}\b/g;
const STRONG = /\b(?:led|lead|leading|spearheaded|architected|owned|pioneered|founded|launched|scaled|drove|single-handedly|reduced|improved|increased|decreased|optimi[sz]ed|accelerated|saved|achieved|built from scratch|designed and (?:built|implemented)|end-to-end)\b/i;
const BUZZ =
  /\b(?:leverag(?:e|ed|es|ing)|synerg\w*|cutting[- ]edge|state[- ]of[- ]the[- ]art|best[- ]in[- ]class|world[- ]class|innovative|scalable|robust|seamless(?:ly)?|passionate|results[- ]driven|ai[- ]powered|blockchain|big data|cloud[- ]native|next[- ]generation|game[- ]chang\w*|holistic|streamlin\w*)\b/i;
const VAGUE_START = /^(?:worked (?:on|with)|helped|assisted|responsible for|involved in|participated in|contributed to|exposure to|familiar with|tasked with)\b/i;

function normalizeHeading(line: string): string {
  return line.trim().replace(/[:\s]+$/, "").replace(/\s+/g, " ").toLowerCase();
}

function headingKind(line: string): SectionKind | null {
  const t = normalizeHeading(line);
  if (!t || t.length > 40) return null;
  for (const [re, kind] of HEADINGS) if (re.test(t)) return kind;
  return null;
}

export function flagBullet(text: string): { flags: BulletFlag[]; score: number } {
  const flags: BulletFlag[] = [];
  const noYears = text.replace(YEAR, "");
  if (METRIC.test(noYears)) flags.push("metric");
  else if (NUMBER.test(noYears)) flags.push("number");
  if (STRONG.test(text)) flags.push("strong-claim");
  if (BUZZ.test(text)) flags.push("buzzword");
  const words = text.split(/\s+/).length;
  if (VAGUE_START.test(text) || (words < 7 && !flags.includes("metric"))) flags.push("vague");
  const weights: Record<BulletFlag, number> = { metric: 4, number: 1, "strong-claim": 2, buzzword: 2, vague: 2 };
  const score = flags.reduce((n, f) => n + weights[f], 0) + Math.min(2, Math.floor(words / 12));
  return { flags, score };
}

/** The lead-in a scripted recruiter uses for a flagged bullet. */
export function probeFor(b: ResumeBullet): string {
  const quoted = `“${b.text.length > 160 ? `${b.text.slice(0, 157)}…` : b.text}”`;
  if (b.flags.includes("metric")) return `Tell me more about: ${quoted} How did you measure that, and what was the baseline?`;
  if (b.flags.includes("strong-claim")) return `Tell me more about: ${quoted} What exactly was your part, and what did the rest of the team do?`;
  if (b.flags.includes("buzzword")) return `Tell me more about: ${quoted} In practice, what did you actually build or do?`;
  return `Tell me more about: ${quoted} What did you specifically do, and what was the outcome?`;
}

export function parseResume(raw: string): ParsedResume {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/\t/g, " ").split("\n").map((l) => l.replace(/\s+$/, ""));
  const nonEmpty = lines.filter((l) => l.trim());
  const first = nonEmpty[0]?.trim() ?? "";
  const name = first && first.split(/\s+/).length <= 5 && !/[\d@]/.test(first) && !headingKind(first) ? first : null;

  const sections: ResumeSection[] = [];
  let current: ResumeSection = { heading: "Header", kind: "other", entries: [], bullets: [] };
  let entry: ResumeEntry | null = null;
  let last = null as "bullet" | "entry" | "text" | null;
  const skillLines: string[] = [];
  const push = () => {
    if (current.bullets.length || current.entries.length || current.kind !== "other" || sections.length === 0) sections.push(current);
  };

  const addBullet = (text: string) => {
    const { flags, score } = flagBullet(text);
    current.bullets.push({ text, section: current.heading, entry: entry?.title ?? null, flags, score });
    if (entry) entry.bulletCount++;
    last = "bullet";
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const kind = headingKind(t);
    if (kind && !BULLET_MARK.test(line)) {
      push();
      current = { heading: t.replace(/:$/, ""), kind, entries: [], bullets: [] };
      entry = null;
      last = null;
      continue;
    }
    if (current.kind === "skills") {
      skillLines.push(t.replace(BULLET_MARK, "$1"));
      continue;
    }
    const bullet = BULLET_MARK.exec(line);
    if (bullet) {
      addBullet(bullet[1]!.trim());
      continue;
    }
    const wraps = last === "bullet" && /^[a-z0-9(]/.test(t) && current.bullets.length > 0;
    if (wraps) {
      // A wrapped line from a PDF: glue it to the previous bullet and recompute its flags.
      const prev = current.bullets[current.bullets.length - 1]!;
      prev.text = `${prev.text} ${t}`;
      Object.assign(prev, flagBullet(prev.text));
      continue;
    }
    const wordCount = t.split(/\s+/).length;
    const body = current.kind === "experience" || current.kind === "projects";
    if (body && (DATE_RANGE.test(t) || wordCount <= 14) && !/[.!?]$/.test(t)) {
      entry = { title: t, dates: DATE_RANGE.exec(t)?.[0] ?? null, bulletCount: 0 };
      current.entries.push(entry);
      last = "entry";
    } else if (body && wordCount >= 8) {
      // Prose instead of bullets: treat each sentence as one.
      for (const s of t.split(/(?<=[.!?])\s+/)) if (s.split(/\s+/).length >= 5) addBullet(s.trim());
    } else if (current.kind === "education" && DATE_RANGE.test(t)) {
      entry = { title: t, dates: DATE_RANGE.exec(t)?.[0] ?? null, bulletCount: 0 };
      current.entries.push(entry);
      last = "entry";
    } else {
      last = "text";
    }
  }
  push();

  const skills = [
    ...new Set(
      skillLines
        .flatMap((l) => l.replace(/^[^:]{1,30}:\s*/, "").split(/[,;|•·]/))
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 30),
    ),
  ];

  const bullets = sections.filter((s) => s.kind === "experience" || s.kind === "projects" || s.kind === "other" || s.kind === "summary").flatMap((s) => s.bullets);
  return { name, sections, bullets, skills, probes: pickProbes(bullets) };
}

/** Up to three bullets, highest score first, at most two from one entry; falls back to the longest bullets. */
export function pickProbes(bullets: ResumeBullet[], max = 3): ResumeBullet[] {
  const ranked = [...bullets].sort((a, b) => b.score - a.score || b.text.length - a.text.length);
  const out: ResumeBullet[] = [];
  const perEntry = new Map<string, number>();
  for (const b of ranked) {
    if (out.length >= max) break;
    if (b.flags.length === 0 && out.length >= 2) continue;
    const key = `${b.section}/${b.entry ?? ""}`;
    if ((perEntry.get(key) ?? 0) >= 2) continue;
    perEntry.set(key, (perEntry.get(key) ?? 0) + 1);
    out.push(b);
  }
  return out;
}
