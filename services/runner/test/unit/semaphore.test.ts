import { describe, expect, it } from "vitest";
import { QueueFullError, Semaphore } from "../../src/semaphore";

describe("Semaphore", () => {
  it("limits concurrency and rejects when the queue is full", async () => {
    const s = new Semaphore(1, 1);
    let active = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const job = () =>
      s.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((r) => release.push(r));
        active--;
      });
    const a = job();
    const b = job();
    await expect(job()).rejects.toBeInstanceOf(QueueFullError);
    release.shift()!();
    await a;
    await new Promise((r) => setTimeout(r, 0));
    release.shift()!();
    await b;
    expect(peak).toBe(1);
  });
});
