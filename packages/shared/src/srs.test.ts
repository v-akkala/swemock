import { describe, expect, it } from "vitest";
import { applyAttempt, DAY_MS, isDue, newCard, SRS_INTERVAL_DAYS } from "./srs";

const T0 = 1_000_000_000_000;

describe("spaced repetition", () => {
  it("schedules a new card for tomorrow", () => {
    const c = newCard(T0);
    expect(c.dueAt).toBe(T0 + DAY_MS);
    expect(isDue(c, T0)).toBe(false);
    expect(isDue(c, T0 + DAY_MS)).toBe(true);
  });

  it("walks 1, 3, 7, 14 days and then masters the problem", () => {
    let card = newCard(T0);
    let now = T0;
    const waits: number[] = [SRS_INTERVAL_DAYS[0]];
    for (let i = 0; i < 3; i++) {
      now = card.dueAt;
      card = applyAttempt(card, "clean", now)!;
      waits.push((card.dueAt - now) / DAY_MS);
    }
    expect(waits).toEqual([1, 3, 7, 14]);
    now = card.dueAt;
    card = applyAttempt(card, "clean", now)!;
    expect(card.mastered).toBe(true);
    expect(isDue(card, now + 365 * DAY_MS)).toBe(false);
  });

  it("restarts after needing help or giving up", () => {
    const later = newCard(T0);
    const advanced = applyAttempt(later, "clean", later.dueAt)!;
    expect(advanced.intervalIdx).toBe(1);
    const reset = applyAttempt(advanced, "needed-help", advanced.dueAt)!;
    expect(reset.intervalIdx).toBe(0);
    expect(reset.dueAt).toBe(advanced.dueAt + DAY_MS);
    expect(applyAttempt(null, "gave-up", T0)!.intervalIdx).toBe(0);
  });

  it("does not create a card for a clean first solve, nor advance one that isn't due", () => {
    expect(applyAttempt(null, "clean", T0)).toBeNull();
    const c = newCard(T0);
    expect(applyAttempt(c, "clean", T0 + 1000)).toEqual(c);
  });
});
