/** Spaced repetition for practice problems: failed or help-needed problems return after 1, 3, 7, and 14 days. */
export const SRS_INTERVAL_DAYS = [1, 3, 7, 14] as const;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface CardState {
  /** Index into SRS_INTERVAL_DAYS of the interval currently being waited out. */
  intervalIdx: number;
  dueAt: number;
  mastered: boolean;
}

export function newCard(now: number): CardState {
  return { intervalIdx: 0, dueAt: now + SRS_INTERVAL_DAYS[0] * DAY_MS, mastered: false };
}

/** The user solved a due card cleanly: wait longer, or finish after the last interval. */
export function advanceCard(card: CardState, now: number): CardState {
  const next = card.intervalIdx + 1;
  if (next >= SRS_INTERVAL_DAYS.length) return { ...card, intervalIdx: SRS_INTERVAL_DAYS.length - 1, mastered: true };
  return { intervalIdx: next, dueAt: now + SRS_INTERVAL_DAYS[next]! * DAY_MS, mastered: false };
}

/** The user needed help again (or gave up): start over. */
export function resetCard(now: number): CardState {
  return newCard(now);
}

export function isDue(card: Pick<CardState, "dueAt" | "mastered">, now: number): boolean {
  return !card.mastered && card.dueAt <= now;
}

/** How a finished attempt maps onto a card. */
export type AttemptOutcome = "clean" | "needed-help" | "gave-up";

export function applyAttempt(card: CardState | null, outcome: AttemptOutcome, now: number): CardState | null {
  if (outcome !== "clean") return resetCard(now);
  // A clean solve only matters for problems already in the review loop; the first solve creates nothing.
  if (!card) return null;
  // Solving ahead of schedule doesn't advance the card.
  return isDue(card, now) ? advanceCard(card, now) : card;
}
