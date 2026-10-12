import type { DsaRunRequest, DsaRunResult } from "@swemock/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshTempDatabase } from "../test-utils";

// The judge is mocked: these tests are about what the app does with its results.
const judge = vi.hoisted(() => ({ runDsa: vi.fn<(req: DsaRunRequest) => Promise<DsaRunResult>>() }));
vi.mock("../judge/client", () => ({
  runDsa: judge.runDsa,
  JudgeError: class JudgeError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));

const SLUG = "count-pairs-with-sum";
const ITEM = `dsa:${SLUG}`;

/** A judge result where every test passes, except those named in `override`. */
function judged(req: DsaRunRequest, override: Record<string, Partial<DsaRunResult["tests"][number]>> = {}): DsaRunResult {
  const tests = req.tests.map((t) => ({
    id: t.id,
    verdict: "accepted" as const,
    timeMs: 1,
    memoryKb: 11_000,
    actual: JSON.stringify(t.expected ?? null),
    stdout: "",
    stderr: "",
    message: null,
    ...override[t.id],
  }));
  const bad = tests.find((t) => t.verdict !== "accepted" && t.verdict !== "ran");
  return {
    verdict: bad ? bad.verdict : "accepted",
    passed: tests.filter((t) => t.verdict === "accepted").length,
    total: req.tests.length,
    compileOutput: null,
    tests,
    maxTimeMs: 1,
    maxMemoryKb: 11_000,
  };
}

async function load() {
  freshTempDatabase();
  const sync = await import("../content/sync");
  sync.ensureContentSynced({ force: true });
  const service = await import("./service");
  const store = await import("./store");
  const srs = await import("./srs");
  const oa = await import("./oa");
  const { ApiError } = await import("../http/errors");
  return { ...service, ...store, ...srs, ...oa, ApiError };
}

beforeEach(() => {
  judge.runDsa.mockReset();
  judge.runDsa.mockImplementation(async (req) => judged(req));
});

const base = { slug: SLUG, language: "python" as const, code: "class Solution: pass" };

describe("run", () => {
  it("judges the samples, creates a practice session, and logs the run", async () => {
    const s = await load();
    const res = await s.runCode(base);
    expect(res).toMatchObject({ kind: "run", verdict: "accepted", total: 3 });
    expect(res.tests.map((t) => t.label)).toEqual(["Sample 1", "Sample 2", "Sample 3"]);

    const sent = judge.runDsa.mock.calls[0]![0];
    expect(sent.tests.every((t) => t.id.startsWith("v"))).toBe(true); // no hidden tests on Run

    const events = s.sessionEvents(res.sessionId);
    expect(events.map((e) => e.kind)).toEqual(["run"]);
    expect(events[0]!.payload).toMatchObject({ slug: SLUG, language: "python", code: base.code });

    // The same session is reused until the problem is solved.
    expect((await s.runCode(base)).sessionId).toBe(res.sessionId);
  });

  it("adds validated custom input as an extra test without an expected answer", async () => {
    const s = await load();
    const res = await s.runCode({ ...base, customInput: '{"nums":[1,1],"target":2}' });
    const sent = judge.runDsa.mock.calls[0]![0];
    expect(sent.tests.at(-1)).toEqual({ id: "custom", input: { nums: [1, 1], target: 2 } });
    expect(res.tests.at(-1)).toMatchObject({ label: "Custom input", hidden: false });

    await expect(s.runCode({ ...base, customInput: "not json" })).rejects.toMatchObject({ status: 400 });
    await expect(s.runCode({ ...base, customInput: '{"nums":"x","target":1}' })).rejects.toThrow(/Custom input: nums/);
    await expect(s.runCode({ ...base, slug: "nope" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("submit", () => {
  it("masks hidden tests completely, and stops at the first failure in practice", async () => {
    const s = await load();
    judge.runDsa.mockImplementation(async (req) =>
      judged(req, {
        h4: { verdict: "wrong_answer", actual: '"SECRET-ACTUAL"', stdout: "SECRET-STDOUT", stderr: "SECRET-ERR", message: "SECRET-MSG" },
      }),
    );
    const res = await s.submitCode(base);
    const sent = judge.runDsa.mock.calls[0]![0];
    expect(sent.stopOnFirstFailure).toBe(true);
    expect(sent.tests.length).toBeGreaterThan(15); // visible + hidden

    expect(res.verdict).toBe("wrong_answer");
    const h4 = res.tests.find((t) => t.id === "h4")!;
    expect(h4).toMatchObject({ hidden: true, label: "Hidden test #4", kind: "edge" });
    expect(JSON.stringify(res)).not.toMatch(/SECRET/);
    // No hidden input or expected value reaches the response either.
    const priv = (await import("../content/repo")).getDsaPrivate(SLUG)!;
    const bigHidden = JSON.stringify(priv.hiddenTests.at(-1)!.input);
    expect(JSON.stringify(res)).not.toContain(bigHidden.slice(0, 80));
    expect(res.solved).toBe(false);
  });

  it("solving ends the practice session; a clean first solve creates no review card", async () => {
    const s = await load();
    const res = await s.submitCode(base);
    expect(res).toMatchObject({ verdict: "accepted", solved: true });
    expect(res.efficiency).toMatchObject({ rating: "comparable" });
    expect(s.getSession(res.sessionId)!.status).toBe("ended");
    expect(s.cardFor(ITEM)).toBeNull();
    expect(s.isSolved(ITEM)).toBe(true);
    // A later attempt starts a fresh session.
    expect((await s.runCode(base)).sessionId).not.toBe(res.sessionId);
  });

  it("puts a problem on the review schedule when hints were used", async () => {
    const s = await load();
    s.revealHint({ slug: SLUG, level: 1 });
    await s.submitCode(base);
    const card = s.cardFor(ITEM)!;
    expect(card).toMatchObject({ intervalIdx: 0, mastered: false, lastResult: "needed-help" });
    expect(card.dueAt - Date.now()).toBeGreaterThan(23 * 3600_000);
    expect(s.dueReviews()).toEqual([]); // due tomorrow, not now
    expect(s.dueReviews(Date.now() + 25 * 3600_000).map((r) => r.slug)).toEqual([SLUG]);
  });

  it("does the same after three wrong submissions", async () => {
    const s = await load();
    judge.runDsa.mockImplementation(async (req) => judged(req, { h1: { verdict: "wrong_answer" } }));
    for (let i = 0; i < 3; i++) await s.submitCode(base);
    judge.runDsa.mockImplementation(async (req) => judged(req));
    await s.submitCode(base);
    expect(s.cardFor(ITEM)).toMatchObject({ lastResult: "needed-help" });
  });

  it("rates efficiency against the reference's slowest test", async () => {
    const s = await load();
    judge.runDsa.mockImplementation(async (req) => ({ ...judged(req), maxTimeMs: 5000 }));
    const res = await s.submitCode(base);
    expect(res.efficiency?.rating).toBe("much-slower");
  });
});

describe("hint ladder", () => {
  it("reveals hints in order and the editorial only after all four", async () => {
    const s = await load();
    expect(() => s.revealHint({ slug: SLUG, level: 2 })).toThrow(/Reveal hint 1 first/);
    const h1 = s.revealHint({ slug: SLUG, level: 1 });
    expect(h1.text.length).toBeGreaterThan(10);
    expect(() => s.revealHint({ slug: SLUG, level: 3, sessionId: h1.sessionId })).toThrow(/Reveal hint 2 first/);
    s.revealHint({ slug: SLUG, level: 2, sessionId: h1.sessionId });
    expect(() => s.revealEditorial({ slug: SLUG, sessionId: h1.sessionId })).toThrow(/all four hints/);
    s.revealHint({ slug: SLUG, level: 3, sessionId: h1.sessionId });
    s.revealHint({ slug: SLUG, level: 4, sessionId: h1.sessionId });
    const ed = s.revealEditorial({ slug: SLUG, sessionId: h1.sessionId });
    expect(ed.editorialMd).toContain("Intuition");
    expect(ed.references.python).toContain("class Solution");

    // Re-requesting a revealed level is allowed and isn't logged twice.
    s.revealHint({ slug: SLUG, level: 1, sessionId: h1.sessionId });
    expect(s.sessionEvents(h1.sessionId, "hint")).toHaveLength(5);

    const page = s.loadProblemPage(SLUG)!;
    expect(page.revealedHints.map((h) => h.level)).toEqual([1, 2, 3, 4]);
    expect(page.editorial).not.toBeNull();
  });

  it("keeps hints out of the page data until they're revealed", async () => {
    const s = await load();
    const page = s.loadProblemPage(SLUG)!;
    expect(page.revealedHints).toEqual([]);
    expect(page.editorial).toBeNull();
    expect(JSON.stringify(page)).not.toContain("hash map from value");
  });

  it("lets a solved problem skip straight to the editorial", async () => {
    const s = await load();
    await s.submitCode(base);
    expect(s.revealEditorial({ slug: SLUG }).editorialMd).toContain("Intuition");
  });

  it("giving up shows the editorial, ends the session, and schedules a review", async () => {
    const s = await load();
    const hint = s.revealHint({ slug: SLUG, level: 1 });
    const ed = s.giveUp({ slug: SLUG, sessionId: hint.sessionId });
    expect(ed.editorialMd).toContain("Intuition");
    expect(s.getSession(hint.sessionId)!.status).toBe("abandoned");
    expect(s.cardFor(ITEM)).toMatchObject({ intervalIdx: 0, lastResult: "gave-up" });
  });
});

describe("drafts and snapshots", () => {
  it("keeps one draft per language and logs a code snapshot at most every 30 seconds", async () => {
    const s = await load();
    const run = await s.runCode(base);
    const t = Date.now();
    s.saveCode({ slug: SLUG, language: "python", code: "py v1", sessionId: run.sessionId }, t);
    s.saveCode({ slug: SLUG, language: "cpp", code: "cpp v1" }, t + 1000);
    s.saveCode({ slug: SLUG, language: "python", code: "py v2" }, t + 2000);
    expect(s.loadDrafts(ITEM, null)).toEqual({ python: "py v2", cpp: "cpp v1" });

    expect(s.sessionEvents(run.sessionId, "code_snapshot")).toHaveLength(1);
    s.saveCode({ slug: SLUG, language: "python", code: "py v3" }, t + 31_000);
    expect(s.sessionEvents(run.sessionId, "code_snapshot")).toHaveLength(2);
  });
});

describe("online assessment", () => {
  it("picks two problems of the requested difficulties and prefers unsolved ones", async () => {
    const s = await load();
    const { listDsa } = await import("../content/repo");
    const items = listDsa();
    const picked = s.pickProblems("medium-hard", items, () => 0);
    expect(picked.map((p) => p.difficulty)).toEqual(["medium", "hard"]);

    const solvedFirst = items.map((i) => (i.slug === picked[0]!.slug ? { ...i, status: "solved" as const } : i));
    expect(s.pickProblems("medium-hard", solvedFirst, () => 0)[0]!.slug).not.toBe(picked[0]!.slug);
  });

  it("runs the full suite, scores partial credit by best attempt, and enforces the deadline", async () => {
    const s = await load();
    const t0 = Date.now();
    const session = s.createOa({ durationMin: 70, mix: "easy-medium" }, t0);
    const state = s.parseState(session);
    const [slugA, slugB] = state.slugs as [string, string];

    judge.runDsa.mockImplementation(async (req) => {
      // Fail the second half of the tests.
      const half = Math.floor(req.tests.length / 2);
      return judged(req, Object.fromEntries(req.tests.slice(half).map((t) => [t.id, { verdict: "wrong_answer" as const }])));
    });
    const first = await s.submitCode({ slug: slugA, language: "python", code: "x", sessionId: session.id });
    expect(judge.runDsa.mock.calls.at(-1)![0].stopOnFirstFailure).toBe(false); // OA needs every test
    expect(first.solved).toBe(false);

    judge.runDsa.mockImplementation(async (req) => judged(req));
    await s.submitCode({ slug: slugA, language: "cpp", code: "x", sessionId: session.id });

    const results = s.oaResults(session);
    const a = results.problems.find((p) => p.slug === slugA)!;
    expect(a.best).toMatchObject({ language: "cpp", verdict: "accepted" });
    expect(a.best!.passed).toBe(a.best!.total);
    expect(results.problems.find((p) => p.slug === slugB)!.best).toBeNull();
    expect(results.score).toBe(50);

    // OA sessions don't allow hints, and other problems aren't part of the assessment.
    expect(() => s.revealHint({ slug: slugA, level: 1, sessionId: session.id })).toThrow(/assessment/);
    await expect(s.submitCode({ slug: "recency-cache", language: "python", code: "x", sessionId: session.id })).rejects.toMatchObject({ status: 400 });

    // After the deadline the session is settled and submissions are refused.
    const settled = s.settleOa(session, state.deadline + 1);
    expect(settled.status).toBe("ended");
    await expect(s.submitCode({ slug: slugA, language: "python", code: "x", sessionId: session.id })).rejects.toMatchObject({ status: 409 });
  });
});
