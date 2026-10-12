/**
 * Server-side post-filter for model output during a round (spec §7.3). The interviewer's prompt already
 * forbids revealing hidden content; this catches it when the model does anyway.
 *
 * - Code: 8-token shingles of the reference solutions. Two or more shared shingles = leak.
 * - Prose: 10-word shingles of the editorial and the later hints. Any shared shingle = leak. A secret
 *   too short to have a shingle (6–9 words, such as a one-line key point) leaks if it appears whole.
 * - In interview mode a fenced code block longer than three lines is blocked outright: interviewers
 *   don't write the candidate's code.
 */
export interface Secrets {
  code: string[];
  prose: string[];
}

export interface LeakCheck {
  leaked: boolean;
  reason: string | null;
}

const CODE_N = 8;
const PROSE_N = 10;
const SHORT_MIN = 6;

function codeTokens(text: string): string[] {
  return text.match(/[A-Za-z_][A-Za-z0-9_]*|\d+|[^\sA-Za-z0-9_]/g) ?? [];
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/[`*_$\\]/g, " ").match(/[a-z0-9]+/g) ?? [];
}

function shingles(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(" "));
  return out;
}

export interface LeakFilter {
  check(text: string): LeakCheck;
}

export function buildLeakFilter(secrets: Secrets, opts: { blockCodeBlocks: boolean }): LeakFilter {
  const code = new Set<string>();
  for (const src of secrets.code) for (const s of shingles(codeTokens(src), CODE_N)) code.add(s);
  const prose = new Set<string>();
  const short: string[] = [];
  for (const p of secrets.prose) {
    const w = words(p);
    if (w.length >= SHORT_MIN && w.length < PROSE_N) short.push(` ${w.join(" ")} `);
    for (const s of shingles(w, PROSE_N)) prose.add(s);
  }

  return {
    check(text: string): LeakCheck {
      if (opts.blockCodeBlocks) {
        for (const m of text.matchAll(/```[^\n]*\n([\s\S]*?)(```|$)/g)) {
          if (m[1]!.split("\n").filter((l) => l.trim()).length > 3) return { leaked: true, reason: "code block" };
        }
      }
      let codeHits = 0;
      for (const s of shingles(codeTokens(text), CODE_N)) if (code.has(s) && ++codeHits >= 2) return { leaked: true, reason: "reference solution" };
      const w = words(text);
      for (const s of shingles(w, PROSE_N)) if (prose.has(s)) return { leaked: true, reason: "editorial" };
      if (short.length) {
        const joined = ` ${w.join(" ")} `;
        if (short.some((phrase) => joined.includes(phrase))) return { leaked: true, reason: "editorial" };
      }
      return { leaked: false, reason: null };
    },
  };
}
