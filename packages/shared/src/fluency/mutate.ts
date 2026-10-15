import type { Language } from "../judge/protocol";

/**
 * Fallible mode (spec §8.4): one deterministic, plausible-looking mutation in code an assistant produced.
 * Operators work on single lines with simple patterns, outside strings and comments. The caller must still
 * verify that the mutated file parses or compiles (a sandbox step), and may try the next candidate.
 */
export const MUTATION_OPS = ["off-by-one", "flipped-comparison", "removed-check", "swapped-arguments", "changed-default", "dropped-close"] as const;
export type MutationOp = (typeof MUTATION_OPS)[number];

export interface Mutation {
  op: MutationOp;
  /** 1-based line of the new text that changed (the first line, for a removal). */
  line: number;
  before: string;
  after: string;
  /** The whole file with the mutation applied. */
  text: string;
}

/** Replaces string-literal contents with filler of the same length, so patterns can't match inside them. */
function maskStrings(line: string): string {
  return line.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, (m) => m[0] + "x".repeat(m.length - 2) + m[0]);
}

const isComment = (line: string, lang: Language) => (lang === "python" ? /^\s*#/ : /^\s*(\/\/|\*|\/\*)/).test(line);

type Site = { op: MutationOp; line: number; replace: (lines: string[]) => string[] };

function lineSites(lines: string[], i: number, lang: Language): Site[] {
  const raw = lines[i]!;
  if (isComment(raw, lang) || !raw.trim()) return [];
  const m = maskStrings(raw);
  const sites: Site[] = [];
  const swap = (re: RegExp, to: (match: RegExpExecArray) => string, op: MutationOp) => {
    const match = re.exec(m);
    if (match) {
      const next = raw.slice(0, match.index) + to(match) + raw.slice(match.index + match[0].length);
      if (next !== raw) sites.push({ op, line: i + 1, replace: (ls) => ls.map((l, k) => (k === i ? next : l)) });
    }
  };

  // off-by-one: a loop bound, a range, or a slice end
  swap(/range\(len\(([\w.]+)\)\)/, (x) => `range(len(${x[1]}) - 1)`, "off-by-one");
  swap(/range\((\w+)\)/, (x) => (/^\d+$/.test(x[1]!) ? x[0] : `range(${x[1]} - 1)`), "off-by-one");
  swap(/\[:(\w+)\]/, (x) => `[:${/^\d+$/.test(x[1]!) ? Number(x[1]) - 1 : `${x[1]} - 1`}]`, "off-by-one");
  swap(/\b(\w+) < (\w+)\b(?=\s*[;)]|\s*:)/, (x) => `${x[1]} <= ${x[2]}`, "off-by-one");

  // flipped comparison
  swap(/ (<=|>=|==|!=|<|>) (?![=>])/, (x) => ` ${{ "<=": "<", ">=": ">", "==": "!=", "!=": "==", "<": ">=", ">": "<=" }[x[1]!]} `, "flipped-comparison");

  // removed null/empty check: an `if` whose whole body is one return/raise/continue line
  if (lang === "python") {
    const next = lines[i + 1] ?? "";
    if (/^\s*if (not [\w.]+|[\w.]+ is None|len\([\w.]+\) == 0|[\w.]+ == 0)\s*:\s*$/.test(m) && /^\s+(return\b|raise\b|continue\b)/.test(next) && !/^\s*(elif|else)\b/.test(lines[i + 2] ?? "")) {
      sites.push({ op: "removed-check", line: i + 1, replace: (ls) => ls.filter((_, k) => k !== i && k !== i + 1) });
    }
  } else if (/^\s*if \((!\w+|\w+ == nullptr|\w+\.empty\(\))\)\s*(return\b|throw\b|continue\b)[^;]*;\s*$/.test(m)) {
    sites.push({ op: "removed-check", line: i + 1, replace: (ls) => ls.filter((_, k) => k !== i) });
  }

  // swapped arguments: a call with exactly two simple arguments
  swap(/\b([A-Za-z_][\w.]*)\(([\w.[\]]+), ([\w.[\]]+)\)/, (x) => (/^(if|while|for|range|len|print|return)$/.test(x[1]!) || x[2] === x[3] ? x[0] : `${x[1]}(${x[3]}, ${x[2]})`), "swapped-arguments");

  // changed default: a default parameter value
  if (lang === "python" ? /^\s*(async\s+)?def\b/.test(m) : /\w+\s+\w+\s*\([^)]*=/.test(m)) {
    swap(/(\w+(?:: ?[\w[\], |]+)?) ?= ?(0|1|True|False|None|-1|10)\b(?=[,)\s])/, (x) => {
      const swapTo: Record<string, string> = { "0": "1", "1": "0", True: "False", False: "True", None: "0", "-1": "0", "10": "1" };
      return x[0].replace(/(0|1|True|False|None|-1|10)$/, swapTo[x[2]!]!);
    }, "changed-default");
  }

  // dropped close or await
  if (/^\s*[\w.[\]]+\.close\(\)\s*;?\s*$/.test(m) || (lang === "cpp" && /^\s*delete \w+;\s*$/.test(m))) {
    sites.push({ op: "dropped-close", line: i + 1, replace: (ls) => ls.filter((_, k) => k !== i) });
  } else if (/\bawait /.test(m)) {
    swap(/\bawait /, () => "", "dropped-close");
  }
  return sites;
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Every mutation that could be applied to the given 1-based lines (or anywhere, if `only` is omitted). */
export function mutationCandidates(text: string, language: Language, only?: ReadonlySet<number>): Mutation[] {
  const lines = text.split("\n");
  const out: Mutation[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (only && !only.has(i + 1)) continue;
    for (const site of lineSites(lines, i, language)) {
      const next = site.replace(lines);
      out.push({ op: site.op, line: site.line, before: lines[i]!, after: next[i] ?? "", text: next.join("\n") });
    }
  }
  return out;
}

/** The candidates in a deterministic pseudo-random order for this seed (try them in turn until one parses). */
export function rankedMutations(text: string, language: Language, seed: string, only?: ReadonlySet<number>): Mutation[] {
  return mutationCandidates(text, language, only)
    .map((m) => ({ m, k: hash(`${seed}:${m.op}:${m.line}`) }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.m);
}

/** Whether this reply is one of the roughly one in five that gets a mutation. Deterministic per seed. */
export function shouldMutate(seed: string, rate = 0.2): boolean {
  return hash(`gate:${seed}`) / 0xffffffff < rate;
}
