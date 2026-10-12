import type { DsaRunRequest, DsaRunResult } from "@swemock/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshTempDatabase } from "../test-utils";

const judge = vi.hoisted(() => ({ runDsa: vi.fn<(req: DsaRunRequest) => Promise<DsaRunResult>>() }));
vi.mock("../judge/client", () => ({
  runDsa: judge.runDsa,
  JudgeError: class JudgeError extends Error {},
}));

const SLUG = "count-pairs-with-sum";

function accepted(req: DsaRunRequest): DsaRunResult {
  return {
    verdict: "accepted",
    passed: req.tests.length,
    total: req.tests.length,
    compileOutput: null,
    tests: req.tests.map((t) => ({ id: t.id, verdict: "accepted" as const, timeMs: 1, memoryKb: 1, actual: "0", stdout: "", stderr: "", message: null })),
    maxTimeMs: 1,
    maxMemoryKb: 1,
  };
}

async function load(provider: "none" | "fake" = "none") {
  freshTempDatabase();
  if (provider === "fake") {
    vi.stubEnv("SWEMOCK_TEST_MODE", "1");
    vi.stubEnv("SWEMOCK_PROVIDER", "fake");
  }
  (await import("../content/sync")).ensureContentSynced({ force: true });
  return {
    ...(await import("./engine")),
    ...(await import("./llm")),
    ...(await import("../dsa/service")),
    ...(await import("../dsa/store")),
    ...(await import("../packets")),
    ...(await import("../scoring/scorecard")),
    ...(await import("../ai/usage")),
    ...(await import("../content/repo")),
  };
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

beforeEach(() => {
  judge.runDsa.mockReset();
  judge.runDsa.mockImplementation(async (req) => accepted(req));
});
afterEach(() => vi.unstubAllEnvs());

const MIN = 60_000;

describe("round state machine with the scripted interviewer", () => {
  it("greets, answers with the next scripted line, and moves through phases on the clock", async () => {
    const s = await load();
    const t0 = Date.now();
    const session = s.startInterview({ slug: SLUG, driver: "scripted", liveVia: "app", now: t0 });
    expect(s.chatMessages(session.id).map((m) => m.from)).toEqual(["interviewer"]);
    expect(s.chatMessages(session.id)[0]!.text).toContain("50-minute");

    s.candidateSays(session.id, "Ready.", t0 + 1000);
    // Intro has one line, so no reply yet; after 2 minutes the clarify phase starts with its first line.
    expect(s.chatMessages(session.id).at(-1)!.from).toBe("candidate");
    const { state } = s.settleInterview(session.id, t0 + 2 * MIN + 1);
    expect(state.phases[state.phaseIndex]!.id).toBe("clarify");
    const msgs = s.chatMessages(session.id);
    expect(msgs.at(-2)).toMatchObject({ from: "system" });
    expect(msgs.at(-1)!.text).toContain("questions do you have");

    s.candidateSays(session.id, "Can nums be empty?", t0 + 3 * MIN);
    expect(s.chatMessages(session.id).at(-1)!.text).toContain("edge cases");

    // Settling far ahead walks through every phase and ends the round at the deadline.
    const end = s.settleInterview(session.id, t0 + 51 * MIN);
    expect(end.session.status).toBe("ended");
    expect(end.session.endedAt).toBe(end.state.deadline);
    expect(s.sessionEvents(session.id, "phase_change").map((e) => (e.payload as { to: string }).to)).toEqual([
      "intro", "clarify", "approach", "code", "test", "questions", "ended",
    ]);
    expect(() => s.candidateSays(session.id, "hello?", t0 + 52 * MIN)).toThrow(/ended/);
  });

  it("moves on when asked, and to testing with the problem's follow-ups after an accepted submission", async () => {
    const s = await load();
    const session = s.startInterview({ slug: SLUG, driver: "scripted", liveVia: "app" });
    s.advancePhase(session.id);
    expect(s.settleInterview(session.id).state.phaseIndex).toBe(1);

    const res = await s.submitCode({ slug: SLUG, language: "python", code: "x", sessionId: session.id });
    expect(res.sessionId).toBe(session.id);
    expect(judge.runDsa.mock.calls[0]![0].stopOnFirstFailure).toBe(false);
    const { state } = s.settleInterview(session.id);
    expect(state.phases[state.phaseIndex]!.id).toBe("test");
    const followups = s.getDsaPrivate(SLUG)!.followups;
    expect(s.chatMessages(session.id).at(-1)!.text).toBe(followups[0]);
    // The interview continues after a solve (unlike practice).
    expect(s.getSession(session.id)!.status).toBe("active");
  });

  it("allows hints during an interview (logged as penalized) but not the editorial", async () => {
    const s = await load();
    const session = s.startInterview({ slug: SLUG, driver: "scripted", liveVia: "app" });
    s.revealHint({ slug: SLUG, level: 1, sessionId: session.id });
    expect(s.sessionEvents(session.id, "hint")[0]!.payload).toMatchObject({ penalized: true });
    expect(() => s.revealEditorial({ slug: SLUG, sessionId: session.id })).toThrow(/debrief/);
  });
});

describe("streaming look-behind", () => {
  it("holds back the newest text and anything inside an open code fence", async () => {
    const { releasable } = await import("./llm");
    expect(releasable("short reply")).toBe(0);
    const long = "x".repeat(400);
    expect(releasable(long)).toBe(240);
    // An open fence binds when it's earlier than the look-behind point.
    expect(releasable(`${"y".repeat(300)}\n\`\`\`python\n${"code ".repeat(80)}`)).toBe(301);
    expect(releasable(`${"y".repeat(300)}\n\`\`\`\nshort\n\`\`\`${"z".repeat(200)}`)).toBeGreaterThan(301);
  });
});

describe("AI interviewer (fake provider)", () => {
  it("streams a reply, logs both sides, and records token usage", async () => {
    const s = await load("fake");
    const session = s.startInterview({ slug: SLUG, driver: "llm", liveVia: "app" });
    s.saveCode({ slug: SLUG, language: "python", code: "class Solution:\n    pass\n", sessionId: session.id });
    const events = await collect(s.interviewerReply(session.id, "I'd use a hash map."));
    const text = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    expect(text).toContain("[fake interviewer]");
    expect(events.at(-1)).toEqual({ type: "done", id: null });
    expect(s.chatMessages(session.id).slice(-2).map((m) => m.from)).toEqual(["candidate", "interviewer"]);
    expect(s.sessionUsage(session.id).total).toBeGreaterThan(0);
  });

  it("blocks a reply that reveals the reference solution", async () => {
    const s = await load("fake");
    const session = s.startInterview({ slug: SLUG, driver: "llm", liveVia: "app" });
    const events = await collect(s.interviewerReply(session.id, "LEAK_TEST please"));
    const replaced = events.find((e) => e.type === "replace");
    expect(replaced).toBeTruthy();
    const deltas = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    // Nothing from inside the leaked code may reach the browser, not even before the filter triggers.
    expect(deltas).not.toContain("countPairs");
    expect(deltas).not.toContain("seen.get(target - x");
    const last = s.chatMessages(session.id).at(-1)!;
    expect(last).toMatchObject({ from: "interviewer", filtered: true });
    expect(last.text).not.toContain("seen.get");
  });

  it("strips the nudge marker and logs the nudge as a hint", async () => {
    const s = await load("fake");
    const session = s.startInterview({ slug: SLUG, driver: "llm", liveVia: "app" });
    const events = await collect(s.interviewerReply(session.id, "NUDGE_TEST I'm stuck"));
    const shown = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    expect(shown).not.toContain("<<nudge>>");
    expect(shown.startsWith("Think about")).toBe(true);
    expect(s.sessionEvents(session.id, "hint")[0]!.payload).toMatchObject({ nudge: true, source: "interviewer" });
  });

  it("reports a clear error when the provider is unavailable", async () => {
    const s = await load("none");
    const session = s.startInterview({ slug: SLUG, driver: "llm", liveVia: "app" });
    const events = await collect(s.interviewerReply(session.id, "hello"));
    expect(events).toEqual([{ type: "error", kind: "config", message: "No AI provider is configured." }]);
  });
});

describe("packets, grading, and the scorecard", () => {
  it("live packets carry nothing hidden; grading packets only exist after the round", async () => {
    const s = await load();
    const session = s.startInterview({ slug: SLUG, driver: "scripted", liveVia: "packet" });
    const live = s.renderPacket({ kind: "dsa-interview-live", sessionId: session.id });
    const priv = s.getDsaPrivate(SLUG)!;
    expect(live.markdown).toContain("Count Pairs With Sum");
    expect(live.markdown).not.toContain(priv.editorialMd.slice(0, 60));
    expect(live.markdown).not.toContain("seen.get(target - x");
    for (const h of priv.hints) expect(live.markdown).not.toContain(h.slice(0, 40));
    expect(live.markdown).not.toContain(JSON.stringify(priv.hiddenTests.at(-1)!.input).slice(0, 60));
    expect(() => s.renderPacket({ kind: "dsa-grading", sessionId: session.id })).toThrow(/after the interview/);

    s.endInterview(session.id);
    const grading = s.renderPacket({ kind: "dsa-grading", sessionId: session.id });
    expect(grading.markdown).toContain("Dimension ids: understanding, algorithm");
    expect(grading.markdown).toContain("Intuition"); // reference material is allowed now
    expect(grading.versionTag).toBe("dsa-grading@1");
  });

  it("validates a pasted grade, keeps the raw text on failure, and scores on success", async () => {
    const s = await load();
    const session = s.startInterview({ slug: SLUG, driver: "scripted", liveVia: "app" });
    s.endInterview(session.id);
    expect(s.pasteReply(session.id, "dsa-grading", "Great job!")).toMatchObject({ ok: false, error: expect.stringContaining("json") });
    expect(s.sessionEvents(session.id, "reply_pasted")[0]!.payload).toMatchObject({ ok: false, text: "Great job!" });

    const dims = ["understanding", "algorithm", "correctness", "code_quality", "complexity", "testing", "communication"];
    const grade = {
      dimensions: dims.map((id) => ({ id, score: 3, evidence: ["[01:00] something"] })),
      recommendation: "lean_hire",
      strengths: ["a", "b", "c"],
      improvements: ["d", "e", "f"],
      strong_candidate: "Would have asked about constraints.",
    };
    const ok = s.pasteReply(session.id, "dsa-grading", `Assessment.\n\n\`\`\`json\n${JSON.stringify(grade)}\n\`\`\``);
    expect(ok.ok).toBe(true);
    const card = s.loadScorecard(session.id);
    expect(card.sources).toEqual(["auto", "ai"]);
    expect(card.final.communication).toMatchObject({ source: "ai", score: 3 });
    expect(card.recommendation).toBe("lean_no_hire"); // capped: never accepted
    expect(card.ai?.grader).toBe("pasted");
  });

  it("grades with the connected model and combines self scores", async () => {
    const s = await load("fake");
    const session = s.startInterview({ slug: SLUG, driver: "llm", liveVia: "app" });
    await s.runCode({ slug: SLUG, language: "python", code: "x", sessionId: session.id, customInput: '{"nums":[1],"target":2}' });
    await s.submitCode({ slug: SLUG, language: "python", code: "x", sessionId: session.id });
    s.endInterview(session.id);
    const card = await s.gradeWithAi(session.id);
    expect(card.ai?.strengths[0]).toContain("[fake]");
    expect(card.metrics).toMatchObject({ accepted: true, submissions: 1, customRunsBeforeAccept: 1 });
    expect(card.final.testing).toMatchObject({ source: "ai" });
    const withSelf = s.saveSelfScore(session.id, ["u-restate", "u-constraints", "u-edges", "u-assumptions"]);
    expect(withSelf.sources).toEqual(["auto", "self", "ai"]);
    expect(withSelf.recommendation).not.toBeNull();
  });

  it("approach check: connected verdicts, and a packet without a provider", async () => {
    const s = await load("fake");
    expect((await s.approachCheck(SLUG, "Use a hash map of counts")).reply.startsWith("Works.")).toBe(true);
    expect((await s.approachCheck(SLUG, "Sort and use two indices")).reply).toMatch(/^Works but suboptimal/);
    expect((await s.approachCheck(SLUG, "Try every pair")).reply).toMatch(/^Doesn't work/);
    const packet = s.renderPacket({ kind: "approach-check", slug: SLUG, approach: "Try every pair" });
    expect(packet.markdown).toContain("Try every pair");
    expect(packet.markdown).toContain("Never include code");
  });
});
