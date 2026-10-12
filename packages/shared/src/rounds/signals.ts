/**
 * Deterministic signals about one spoken or typed answer (spec §8.5 "auto signals"): length, speed,
 * ownership ("I" vs "we"), whether it contains a number, and filler words when voice was used.
 */
export interface AnswerSignals {
  words: number;
  /** Seconds from the question to the answer being sent. */
  durationSec: number | null;
  /** Words per minute of speech; voice answers only. */
  wpm: number | null;
  iCount: number;
  weCount: number;
  /** Share of first-person pronouns that are singular; null if there were none. */
  iShare: number | null;
  hasNumber: boolean;
  /** Filler words; voice answers only. */
  fillers: number | null;
  fillerBreakdown: Record<string, number> | null;
}

const I_WORDS = /\b(?:i|i'm|i've|i'll|i'd|me|my|mine|myself)\b/gi;
const WE_WORDS = /\b(?:we|we're|we've|we'll|we'd|us|our|ours|ourselves)\b/gi;
// Years and dates are not metrics; strip them before looking for numbers.
const YEAR = /\b(?:19|20)\d{2}\b/g;
const NUMBER = /\d|\b(?:percent|million|billion|thousand|hundred|doubled|tripled|halved|twice)\b/i;

/** The fixed filler list (documented in docs/scoring.md). "like" only counts when set off by commas. */
const FILLERS: [string, RegExp][] = [
  ["um", /\bum+\b/gi],
  ["uh", /\buh+\b/gi],
  ["er", /\ber+m?\b/gi],
  ["ah", /\bah+\b/gi],
  ["hmm", /\bhm+\b/gi],
  ["you know", /\byou know\b/gi],
  ["i mean", /\bi mean\b/gi],
  ["sort of", /\bsort of\b/gi],
  ["kind of", /\bkind of\b/gi],
  ["basically", /\bbasically\b/gi],
  ["literally", /\bliterally\b/gi],
  ["like", /,\s*like\s*,/gi],
];

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function answerSignals(
  text: string,
  opts: { durationMs?: number | null; speechMs?: number | null; voice?: boolean } = {},
): AnswerSignals {
  const words = countWords(text);
  const iCount = (text.match(I_WORDS) ?? []).length;
  const weCount = (text.match(WE_WORDS) ?? []).length;
  const voice = Boolean(opts.voice);
  const breakdown: Record<string, number> = {};
  if (voice) {
    for (const [name, re] of FILLERS) {
      const n = (text.match(re) ?? []).length;
      if (n) breakdown[name] = n;
    }
  }
  const speechMin = (opts.speechMs ?? 0) / 60_000;
  return {
    words,
    durationSec: opts.durationMs != null ? Math.round(opts.durationMs / 100) / 10 : null,
    // Under five seconds of speech the rate is noise.
    wpm: voice && speechMin >= 5 / 60 ? Math.round(words / speechMin) : null,
    iCount,
    weCount,
    iShare: iCount + weCount > 0 ? iCount / (iCount + weCount) : null,
    hasNumber: NUMBER.test(text.replace(YEAR, "")),
    fillers: voice ? Object.values(breakdown).reduce((a, b) => a + b, 0) : null,
    fillerBreakdown: voice ? breakdown : null,
  };
}

export interface BehavioralMetrics {
  answers: number;
  avgWords: number;
  /** Aggregate over all answers; null if no first-person pronouns at all. */
  iShare: number | null;
  numberShare: number;
  avgDurationSec: number | null;
  voiceAnswers: number;
  fillers: number | null;
  avgWpm: number | null;
}

export function summarizeSignals(all: AnswerSignals[]): BehavioralMetrics {
  const n = all.length;
  const i = all.reduce((a, s) => a + s.iCount, 0);
  const we = all.reduce((a, s) => a + s.weCount, 0);
  const durations = all.map((s) => s.durationSec).filter((d): d is number => d !== null);
  const voice = all.filter((s) => s.fillers !== null);
  const wpms = all.map((s) => s.wpm).filter((w): w is number => w !== null);
  return {
    answers: n,
    avgWords: n ? Math.round(all.reduce((a, s) => a + s.words, 0) / n) : 0,
    iShare: i + we > 0 ? i / (i + we) : null,
    numberShare: n ? all.filter((s) => s.hasNumber).length / n : 0,
    avgDurationSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    voiceAnswers: voice.length,
    fillers: voice.length ? voice.reduce((a, s) => a + (s.fillers ?? 0), 0) : null,
    avgWpm: wpms.length ? Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length) : null,
  };
}
