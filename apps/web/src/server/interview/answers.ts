import "server-only";
import { answerSignals, type AnswerSignals } from "@swemock/shared";
import { sessionEvents } from "../dsa/store";
import type { ChatPayload, ChatRef } from "./chat";

/** A candidate message shorter than this is a reply ("ready", "yes"), not an answer. */
export const ANSWER_MIN_WORDS = 25;

export interface AnswerTurn {
  ts: number;
  /** The interviewer line this answers (question or follow-up), if any. */
  prompt: string | null;
  promptRef: ChatRef | null;
  text: string;
  signals: AnswerSignals;
  /** Long enough to count as an answer in the metrics. */
  counts: boolean;
}

/**
 * Every candidate message with the interviewer line before it and its signals. "Time to answer" is the
 * gap from that line to the message, so it includes thinking time; voice answers also carry speech time.
 */
export function answerTurns(sessionId: string): AnswerTurn[] {
  const chat = sessionEvents<ChatPayload>(sessionId, "chat").filter((e) => e.payload.from !== "system");
  const turns: AnswerTurn[] = [];
  let prompt: { ts: number; text: string; ref: ChatRef | null } | null = null;
  for (const e of chat) {
    const p = e.payload;
    if (p.from === "interviewer") {
      prompt = { ts: e.ts, text: p.text, ref: p.ref ?? null };
      continue;
    }
    const signals = answerSignals(p.text, {
      durationMs: prompt ? e.ts - prompt.ts : null,
      speechMs: p.meta?.speechMs ?? null,
      voice: p.meta?.voice ?? false,
    });
    turns.push({ ts: e.ts, prompt: prompt?.text ?? null, promptRef: prompt?.ref ?? null, text: p.text, signals, counts: signals.words >= ANSWER_MIN_WORDS });
  }
  return turns;
}
