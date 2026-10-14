import type { ProjectRunRequest, ProjectRunResult } from "@swemock/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshTempDatabase } from "../test-utils";

const judge = vi.hoisted(() => ({ runProject: vi.fn<(req: ProjectRunRequest) => Promise<ProjectRunResult>>() }));
vi.mock("../judge/client", () => ({
  runProject: judge.runProject,
  runDsa: vi.fn(),
  JudgeError: class JudgeError extends Error {},
}));

const SLUG = "parking-lot";

type Status = "passed" | "failed";
function result(tests: { name: string; classname: string; status?: Status; category?: "core" | "edge" | "extension"; message?: string }[], extra: Partial<ProjectRunResult> = {}): ProjectRunResult {
  return {
    exitCode: tests.some((t) => t.status === "failed") ? 1 : 0,
    timedOut: false,
    oomKilled: false,
    durationMs: 100,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    tests: tests.map((t) => ({ name: t.name, classname: t.classname, status: t.status ?? "passed", message: t.message ?? null, timeMs: 1, category: t.category ?? "core" })),
    resultsError: null,
    files: {},
    ...extra,
  };
}

/** A fake judge that "runs" the workspace: it reports one test per declared test name, all passing unless told otherwise. */
function declared(req: ProjectRunRequest, fail: (name: string) => boolean = () => false): ProjectRunResult {
  const tests: Parameters<typeof result>[0] = [];
  for (const [path, text] of Object.entries(req.files)) {
    if (!path.startsWith("tests/")) continue;
    for (const m of text.matchAll(/def (test_(core|edge|extension)_\w+)/g)) {
      tests.push({ name: m[1]!, classname: path.replace(/\.py$/, "").replace(/\//g, "."), category: m[2] as "core", status: fail(m[1]!) ? "failed" : "passed", message: fail(m[1]!) ? "AssertionError: secret hidden detail" : undefined });
    }
  }
  return result(tests);
}

async function load() {
  freshTempDatabase();
  (await import("../content/sync")).ensureContentSynced({ force: true });
  return {
    ...(await import("./service")),
    ...(await import("../dsa/store")),
    ...(await import("../interview/engine")),
    ...(await import("../interview/rounds/lld")),
    ...(await import("../scoring/scorecard")),
    ...(await import("../packets")),
    ...(await import("../debrief")),
    ...(await import("../content/lld")),
  };
}

beforeEach(() => {
  judge.runProject.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const files = (s: Awaited<ReturnType<typeof load>>, edit?: (path: string, text: string) => string) =>
  Object.fromEntries(s.getLld(SLUG)!.pub.languages.python!.files.map((f) => [f.path, edit ? edit(f.path, f.content) : f.content]));

describe("LLD practice", () => {
  it("run uses only the visible tests; submit adds the hidden ones, masked, and counts by category", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req, (n) => n === "test_core_busy_day"));

    const run = await s.runLld({ slug: SLUG, language: "python", files: files(s) });
    expect(Object.keys(judge.runProject.mock.calls[0]![0].files).filter((p) => p.startsWith("tests/"))).toEqual(["tests/visible/test_visible.py"]);
    expect(run.tests.every((t) => !t.hidden)).toBe(true);
    expect(run.counts.extension.total).toBe(0);

    const submit = await s.submitLld({ slug: SLUG, language: "python", files: files(s), sessionId: run.sessionId });
    const sent = Object.keys(judge.runProject.mock.calls.at(-1)![0].files).filter((p) => p.startsWith("tests/"));
    expect(sent).toEqual(["tests/visible/test_visible.py", "tests/hidden/test_hidden.py"]);
    expect(submit.solved).toBe(false);
    const hidden = submit.tests.filter((t) => t.hidden);
    expect(hidden.length).toBeGreaterThan(8);
    expect(hidden.map((t) => t.label)).toEqual(hidden.map((_, i) => `Hidden test #${i + 1}`));
    const failed = hidden.find((t) => t.status === "failed")!;
    expect(failed.message ?? null).toBeNull(); // no message for hidden tests
    expect(JSON.stringify(submit)).not.toContain("secret hidden detail");
    expect(JSON.stringify(submit)).not.toContain("test_core_busy_day");
    expect(submit.counts.core.total).toBeGreaterThan(5);
    expect(submit.counts.edge.total).toBeGreaterThan(2);
  });

  it("the extension tests run separately and only after the requirement change", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req, (n) => n.startsWith("test_extension")));
    const first = await s.submitLld({ slug: SLUG, language: "python", files: files(s) });
    expect(first.extensionIncluded).toBe(false);
    expect(first.solved).toBe(true);
    expect(judge.runProject).toHaveBeenCalledTimes(1);

    const change = s.introduceChange({ slug: SLUG, sessionId: first.sessionId });
    expect(change.changeMd).toContain("monthly passes");
    const second = await s.submitLld({ slug: SLUG, language: "python", files: files(s), sessionId: first.sessionId });
    expect(judge.runProject).toHaveBeenCalledTimes(3);
    const extFiles = Object.keys(judge.runProject.mock.calls.at(-1)![0].files).filter((p) => p.startsWith("tests/"));
    expect(extFiles).toEqual(["tests/extension/test_extension.py"]);
    expect(second.extensionIncluded).toBe(true);
    expect(second.counts.extension).toEqual({ passed: 0, total: 4 });
    expect(second.solved).toBe(true); // core and edge decide "solved"
  });

  it("a build error hides compiler output that quotes hidden tests, and counts the declared tests as failed", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) =>
      result([], {
        tests: null,
        exitCode: 2,
        stderr: req.files["tests/hidden/test_hidden.py"] ? "tests/hidden/test_hidden.py:12: error: assert lot.available(M) == 6" : "plain visible error",
      }),
    );
    const submit = await s.submitLld({ slug: SLUG, language: "python", files: files(s) });
    expect(submit.buildError).toMatch(/hidden test couldn't be built/);
    expect(submit.buildError).not.toContain("assert lot.available");
    expect(submit.total).toBeGreaterThan(10);
    expect(submit.tests.every((t) => t.status === "error")).toBe(true);
    const run = await s.runLld({ slug: SLUG, language: "python", files: files(s), sessionId: submit.sessionId });
    expect(run.buildError).toBe("plain visible error");
  });

  it("only the manifest's files are sent, and edits to provided files are tracked", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req));
    const edited = files(s, (p, t) => (p === "models.py" ? `${t}\n# my note\nEXTRA = 1\n` : t));
    const res = await s.submitLld({ slug: SLUG, language: "python", files: { ...edited, "evil.py": "import os" } });
    expect(Object.keys(judge.runProject.mock.calls[0]![0].files)).not.toContain("evil.py");
    expect(res.edits).toEqual({ "models.py": { added: 3, removed: 0 } });
    const card = s.loadScorecard(res.sessionId);
    expect(card.metricLines.join("\n")).toContain("models.py (+3 −0)");
  });

  it("hints unlock in order, then the design notes; giving up reveals everything and ends the session", async () => {
    const s = await load();
    const first = s.revealLldHint({ slug: SLUG, level: 1 });
    expect(() => s.revealLldHint({ slug: SLUG, level: 3, sessionId: first.sessionId })).toThrow(/Reveal hint 2 first/);
    expect(() => s.revealLldDesign({ slug: SLUG, sessionId: first.sessionId })).toThrow(/all four hints/);
    for (const level of [2, 3, 4]) s.revealLldHint({ slug: SLUG, level, sessionId: first.sessionId });
    const design = s.revealLldDesign({ slug: SLUG, sessionId: first.sessionId });
    expect(design.designMd).toContain("Design notes");
    expect(design.references.python!["parking_lot.py"]).toContain("class ParkingLot");
    expect(s.loadLldPage(SLUG)!.reveal).not.toBeNull();

    const other = await load();
    const g = other.giveUpLld({ slug: SLUG });
    expect(g.diagram).toContain("classDiagram");
    expect(other.loadLldPage(SLUG)!.sessionId).toBeNull(); // the practice session ended
  });

  it("drafts autosave per language and come back on the next visit", async () => {
    const s = await load();
    s.saveLld({ slug: SLUG, language: "python", files: files(s, (p, t) => (p === "parking_lot.py" ? `${t}\n# draft` : t)) });
    expect(s.loadLldPage(SLUG)!.drafts.python!["parking_lot.py"]).toContain("# draft");
  });
});

describe("LLD interview", () => {
  it("brings in the requirement change at 60% of the time, once, and unlocks the extension tests", async () => {
    const s = await load();
    const t0 = Date.now();
    const session = s.startLldInterview({ slug: SLUG, driver: "scripted", liveVia: "app", now: t0 });
    const MIN = 60_000;
    expect(s.settleInterview(session.id, t0).state.phases.map((p) => p.id)).toEqual(["intro", "design", "implement", "change", "wrapup"]);
    const before = s.settleInterview(session.id, t0 + 26 * MIN);
    expect(before.state.phases[before.state.phaseIndex]!.id).toBe("implement");
    expect(s.sessionEvents(session.id, "requirement_change")).toHaveLength(0);

    const after = s.settleInterview(session.id, t0 + 27 * MIN + 1000);
    expect(after.state.phases[after.state.phaseIndex]!.id).toBe("change");
    expect(s.sessionEvents(session.id, "requirement_change")).toHaveLength(1);
    const lines = s.chatMessages(session.id).map((m) => m.text);
    expect(lines.some((l) => l.startsWith("New requirement: The lot now supports monthly passes"))).toBe(true);
    s.settleInterview(session.id, t0 + 30 * MIN);
    expect(s.sessionEvents(session.id, "requirement_change")).toHaveLength(1);
    expect(s.settleInterview(session.id, t0 + 46 * MIN).session.status).toBe("ended");
  });

  it("scores working code from the best submission, caps the recommendation when tests fail, and builds packets", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req, (n) => n === "test_core_busy_day"));
    const session = s.startLldInterview({ slug: SLUG, driver: "scripted", liveVia: "app" });
    s.saveLld({ slug: SLUG, language: "python", files: files(s), sessionId: session.id });
    await s.submitLld({ slug: SLUG, language: "python", files: files(s), sessionId: session.id });
    expect(() => s.renderPacket({ kind: "lld-grading", sessionId: session.id })).toThrow(/after the interview ends/);
    const live = s.renderPacket({ kind: "lld-interview-live", sessionId: session.id });
    expect(live.markdown).toContain("Parking Lot");
    expect(live.markdown).toContain("class ParkingLot");
    expect(live.markdown).not.toContain("heapq");
    s.endInterview(session.id);

    const card = s.loadScorecard(session.id);
    expect(card.rubric.id).toBe("lld-interview");
    expect(card.final.correctness).toMatchObject({ source: "auto" });
    expect(card.metricLines.join("\n")).toMatch(/Best submission: \d+\/\d+ core and edge tests/);
    const grading = s.renderPacket({ kind: "lld-grading", sessionId: session.id });
    expect(grading.markdown).toContain("Dimension ids: correctness, separation");
    expect(grading.markdown).toContain("heapq");
    expect(grading.markdown).toContain("monthly passes");

    const dims = card.rubric.dimensions.map((d) => d.id);
    const grade = { dimensions: dims.map((id) => ({ id, score: 4, evidence: ["[05:00] x"] })), recommendation: "strong_hire", strengths: ["a", "b", "c"], improvements: ["a", "b", "c"], strong_candidate: "x" };
    const pasted = s.pasteReply(session.id, "lld-grading", "```json\n" + JSON.stringify(grade) + "\n```");
    expect(pasted).toMatchObject({ ok: true });
    // All dimensions 4 would be Strong Hire, but a failing hidden test caps it.
    expect(s.loadScorecard(session.id).recommendation).toBe("lean_no_hire");

    const debrief = s.loadDebrief(session.id)!;
    expect(debrief.roundType).toBe("lld");
    expect(debrief.lld!.design.references.python!["parking_lot.py"]).toContain("class ParkingLot");
    expect(debrief.problemHref).toBe("/lld/parking-lot");
  });
});
