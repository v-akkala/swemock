import { computeHunks, type ProjectRunRequest, type ProjectRunResult } from "@swemock/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshTempDatabase } from "../test-utils";

const judge = vi.hoisted(() => ({ runProject: vi.fn<(req: ProjectRunRequest) => Promise<ProjectRunResult>>() }));
vi.mock("../judge/client", () => ({ runProject: judge.runProject, runDsa: vi.fn(), JudgeError: class JudgeError extends Error {} }));

type Status = "passed" | "failed";

function run(tests: { name: string; classname: string; status?: Status; category?: "acceptance" | "regression" | "core"; message?: string }[], exitCode = 0): ProjectRunResult {
  return {
    exitCode,
    timedOut: false,
    oomKilled: false,
    durationMs: 10,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    tests: tests.map((t) => ({ name: t.name, classname: t.classname, status: t.status ?? "passed", message: t.message ?? null, timeMs: 1, category: t.category ?? "core" })),
    resultsError: null,
    files: {},
  };
}

/** A fake judge: one test per `def test_…` in the test files it was given; names listed in `failing` fail. */
function declared(req: ProjectRunRequest, failing: string[] = []): ProjectRunResult {
  const tests: Parameters<typeof run>[0] = [];
  for (const [path, text] of Object.entries(req.files)) {
    if (!path.startsWith("tests/")) continue;
    for (const m of text.matchAll(/def (test_\w+)/g)) {
      const name = m[1]!;
      tests.push({
        name,
        classname: path.replace(/\.py$/, "").replace(/\//g, "."),
        category: name.includes("acceptance") ? "acceptance" : "regression",
        status: failing.includes(name) ? "failed" : "passed",
        message: failing.includes(name) ? "AssertionError: secret hidden detail" : undefined,
      });
    }
  }
  return run(tests);
}

async function load(opts: { fake?: boolean } = {}) {
  freshTempDatabase();
  if (opts.fake) {
    vi.stubEnv("SWEMOCK_TEST_MODE", "1");
    vi.stubEnv("SWEMOCK_PROVIDER", "fake");
  }
  (await import("../content/sync")).ensureContentSynced({ force: true });
  return {
    ...(await import("./service")),
    ...(await import("./assistant")),
    ...(await import("./findings")),
    ...(await import("./metrics")),
    ...(await import("../content/fluency")),
    ...(await import("../dsa/store")),
    ...(await import("../db")),
    ...(await import("../settings")),
    ...(await import("../http/errors")),
  };
}
type S = Awaited<ReturnType<typeof load>>;

beforeEach(() => {
  judge.runProject.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const EXT = "todo-api";
const COMP = "csv-etl-pipeline";

const startFiles = (s: S, type: "extension" | "comprehension" | "review", slug: string) => s.startingFiles(type, s.getFluency(type, slug)!.pub);

describe("extractBlocks", () => {
  const known = (p: string) => ["a.py", "src/b.py"].includes(p);

  it("reads path= info strings, first-line path comments, and a lone block for the open file", async () => {
    const s = await load();
    const reply = "Here:\n```python path=src/b.py\nprint(1)\n```\nand\n```python\n# path: a.py\nprint(2)\n```\n";
    expect(s.extractBlocks(reply, null, known)).toEqual([
      { path: "src/b.py", content: "print(1)" },
      { path: "a.py", content: "print(2)" },
    ]);
    expect(s.extractBlocks("```python\nx = 1\n```", "a.py", known)).toEqual([{ path: "a.py", content: "x = 1" }]);
    expect(s.extractBlocks("```python\nx = 1\n```\n```python\ny = 2\n```", "a.py", known)).toEqual([]);
    expect(s.extractBlocks("```python path=nope.txt\nx\n```", null, known)).toEqual([]);
  });
});

describe("sanitizeFiles", () => {
  it("keeps the item's paths and safe new files, and restores deleted ones", async () => {
    const s = await load();
    const pub = s.getFluency("extension", EXT)!.pub;
    const base = startFiles(s, "extension", EXT);
    const sent = {
      ...base,
      "src/todoapp/tags_extra.py": "x = 1",
      "tests/hidden/test_evil.py": "def test_x(): pass",
      "../escape.py": "x",
      "src/todoapp/binary.exe": "x",
      ".results/junit.xml": "<x/>",
    };
    delete (sent as Record<string, string>)["CONVENTIONS.md"];
    const out = s.sanitizeFiles("extension", pub, sent);
    expect(Object.keys(out).sort()).toEqual([...Object.keys(base), "src/todoapp/tags_extra.py"].sort());
    expect(out["CONVENTIONS.md"]).toBe(base["CONVENTIONS.md"]);
  });

  it("refuses a workspace that is too large", async () => {
    const s = await load();
    const pub = s.getFluency("extension", EXT)!.pub;
    const big = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`src/todoapp/big${i}.py`, "x".repeat(150_000)]));
    expect(() => s.sanitizeFiles("extension", pub, { ...startFiles(s, "extension", EXT), ...big })).toThrow(s.ApiError);
  });
});

describe("running and submitting", () => {
  it("run sends no hidden tests; submit adds them and masks the results", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req, ["test_acceptance_tags_endpoint_follows_deletes"]));
    const files = startFiles(s, "extension", EXT);
    const commandId = s.getFluency("extension", EXT)!.pub.commands[0]!.id;

    const ran = await s.runCommand({ type: "extension", slug: EXT, files, commandId });
    expect(Object.keys(judge.runProject.mock.calls[0]![0].files).some((p) => p.startsWith("tests/hidden"))).toBe(false);
    expect(ran.tests!.every((t) => !t.hidden)).toBe(true);

    const sub = await s.submit({ type: "extension", slug: EXT, files, sessionId: ran.sessionId });
    expect(Object.keys(judge.runProject.mock.calls.at(-1)![0].files).some((p) => p.startsWith("tests/hidden"))).toBe(true);
    expect(sub.solved).toBe(false);
    expect(sub.counts.acceptance!.total).toBeGreaterThan(5);
    expect(sub.counts.acceptance!.passed).toBe(sub.counts.acceptance!.total - 1);
    const hidden = sub.tests.filter((t) => t.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((t) => /^Hidden test #\d+$/.test(t.label) && t.message === null)).toBe(true);
    const json = JSON.stringify(sub);
    expect(json).not.toContain("test_acceptance");
    expect(json).not.toContain("secret hidden detail");
    expect(json).not.toContain("tests/hidden");
  });

  it("an all-passing submission is solved; a build failure explains itself without leaking", async () => {
    const s = await load();
    const files = startFiles(s, "extension", EXT);
    judge.runProject.mockImplementation(async (req) => declared(req));
    expect((await s.submit({ type: "extension", slug: EXT, files })).solved).toBe(true);
    judge.runProject.mockImplementation(async () => ({ ...run([], 2), tests: null, stderr: "ImportError while importing tests/hidden/test_tags_acceptance.py: no module named todoapp.tags" }));
    const broken = await s.submit({ type: "extension", slug: EXT, files });
    expect(broken.solved).toBe(false);
    expect(broken.buildError).toMatch(/couldn't be built/);
    expect(broken.buildError).not.toContain("test_tags_acceptance");
  });

  it("comprehension has nothing to submit, and a command must belong to the item", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req));
    const files = startFiles(s, "comprehension", COMP);
    await expect(s.submit({ type: "comprehension", slug: COMP, files })).rejects.toThrow(/nothing to submit/);
    await expect(s.runCommand({ type: "comprehension", slug: COMP, files, commandId: "rm-rf" })).rejects.toThrow(/isn't part of this exercise/);
  });

  it("practice sessions start on first use, save drafts, and end through finishPractice", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req));
    const files = startFiles(s, "comprehension", COMP);
    const commandId = s.getFluency("comprehension", COMP)!.pub.commands[0]!.id;
    expect(s.loadFluencyPage("comprehension", COMP)!.sessionId).toBeNull();
    const { sessionId } = await s.runCommand({ type: "comprehension", slug: COMP, files, commandId });
    s.saveWorkspace({ type: "comprehension", slug: COMP, files: { ...files, "tests/test_mine.py": "def test_mine():\n    pass\n" }, sessionId });
    const page = s.loadFluencyPage("comprehension", COMP)!;
    expect(page.sessionId).toBe(sessionId);
    expect(page.drafts!["tests/test_mine.py"]).toContain("test_mine");
    expect(s.finishPractice("comprehension", COMP, sessionId).sessionId).toBe(sessionId);
    expect(s.getSession(sessionId)!.status).toBe("ended");
  });

  it("the page data for a comprehension item carries no planted-bug information", async () => {
    const s = await load();
    const page = JSON.stringify(s.loadFluencyPage("comprehension", COMP));
    const priv = s.getFluencyPrivate("comprehension", COMP) as unknown as { manifest: { bugs: { explanation: string; title: string }[] } };
    for (const b of priv.manifest.bugs) {
      expect(page).not.toContain(b.explanation);
      expect(page).not.toContain(b.title);
    }
    expect(page).not.toContain("test_bug_");
  });
});

describe("findings", () => {
  it("fold adds, edits and removals; reviewFindings matches against the planted bugs", async () => {
    const s = await load();
    const item = s.getFluency("comprehension", COMP)!;
    const session = s.startSession({ itemId: item.id, mode: "practice", roundType: "comprehension" });
    const priv = s.getFluencyPrivate("comprehension", COMP) as unknown as { manifest: { bugs: { id: string; file: string; lines: [number, number]; category: never; severity: never }[] } };
    const bug = priv.manifest.bugs[0]!;

    // Events in the same millisecond have no defined order, so step the clock between them.
    vi.useFakeTimers({ toFake: ["Date"] });
    const tick = () => vi.setSystemTime(Date.now() + 5);
    const a = s.addFinding(session.id, { file: bug.file, lines: bug.lines, category: bug.category, severity: bug.severity, text: "this is wrong" }, Date.now());
    tick();
    const b = s.addFinding(session.id, { file: bug.file, lines: [1, 1], category: "style", severity: "low", text: "nit" }, Date.now());
    tick();
    s.editFinding(session.id, b.id, { file: bug.file, lines: [2, 2], category: "style", severity: "low", text: "nit 2" });
    tick();
    s.removeFinding(session.id, b.id);
    tick();
    s.setSummary(session.id, "A pipeline.");
    expect(() => s.removeFinding(session.id, "nope")).toThrow(s.ApiError);

    const folded = s.foldFindings(session.id);
    expect(folded.findings.map((f) => f.id)).toEqual([a.id]);
    expect(folded.summary).toBe("A pipeline.");

    const review = s.reviewFindings(s.getSession(session.id)!)!;
    expect(review.match.matches.map((m) => m.plantedId)).toEqual([bug.id]);
    expect(review.match.missed).not.toContain(bug.id);
    expect(review.match.falsePositives).toEqual([]);
    expect(review.planted.length).toBe(priv.manifest.bugs.length);
  });
});

describe("assistant", () => {
  it("without a model, Ask AI composes a packet and logs the prompt", async () => {
    const s = await load();
    const files = startFiles(s, "comprehension", COMP);
    const turn = await s.askAssistant({ type: "comprehension", slug: COMP, question: "What does read_rows do?", context: [{ path: "reader.py" }], files });
    expect(turn.reply).toBeNull();
    expect(turn.packet).toContain("What does read_rows do?");
    expect(turn.packet).toContain("### reader.py");
    const session = s.activePracticeSession(s.getFluency("comprehension", COMP)!.id)!;
    expect(s.sessionEvents(session.id, "assistant_prompt")).toHaveLength(1);
  });

  it("pasting a reply extracts proposals for known files", async () => {
    const s = await load();
    const files = startFiles(s, "comprehension", COMP);
    const turn = await s.pasteAssistantReply({ type: "comprehension", slug: COMP, text: "Try:\n```python path=reader.py\nX = 1\n```\n", files });
    // The file ends with a newline, and so does the proposal: no phantom hunk at the end.
    expect(turn.proposals.map((p) => [p.path, p.newContent])).toEqual([["reader.py", "X = 1\n"]]);
    await expect(s.pasteAssistantReply({ type: "comprehension", slug: COMP, text: "  ", files })).rejects.toThrow(/Paste the reply/);
  });

  it("with the fake model, replies carry proposals and no mutation unless fallible mode is on", async () => {
    const s = await load({ fake: true });
    judge.runProject.mockResolvedValue(run([]));
    const files = startFiles(s, "comprehension", COMP);
    const turn = await s.askAssistant({ type: "comprehension", slug: COMP, question: "add a helper", context: [{ path: "reader.py" }], files });
    expect(turn.proposals).toHaveLength(1);
    expect(turn.proposals[0]!.newContent).toContain("fake_assistant_helper");
    const session = s.activePracticeSession(s.getFluency("comprehension", COMP)!.id)!;
    expect(s.sessionEvents(session.id, "mutation_injected")).toHaveLength(0);
  });

  it("fallible mode mutates the proposal, hides it from the turn, and reports whether it was caught", async () => {
    const s = await load({ fake: true });
    vi.stubEnv("SWEMOCK_FALLIBLE_RATE", "1");
    s.updateSettings(s.getDb(), { features: { voiceInput: false, fallibleMode: true } });
    judge.runProject.mockResolvedValue(run([])); // every candidate mutation "parses"
    const files = startFiles(s, "comprehension", COMP);
    const turn = await s.askAssistant({ type: "comprehension", slug: COMP, question: "add a helper", context: [{ path: "reader.py" }], files });
    const session = s.activePracticeSession(s.getFluency("comprehension", COMP)!.id)!;

    const injected = s.sessionEvents<{ proposalId: string; path: string; before: string; after: string }>(session.id, "mutation_injected");
    expect(injected).toHaveLength(1);
    expect(JSON.stringify(turn)).not.toContain("mutation");
    const proposal = turn.proposals.find((p) => p.id === injected[0]!.payload.proposalId)!;
    expect(proposal.newContent).toContain(injected[0]!.payload.after.trim());

    // Accepting every hunk and leaving the mutated line alone is a miss.
    const hunks = computeHunks(proposal.base, proposal.newContent);
    s.logApply({ type: "comprehension", slug: COMP, sessionId: session.id, proposalId: proposal.id, path: proposal.path, accepted: hunks.map((h) => h.id), rejected: [] });
    s.saveWorkspace({ type: "comprehension", slug: COMP, sessionId: session.id, files: { ...files, [proposal.path]: proposal.newContent } });
    let reports = s.mutationReports(s.getSession(session.id)!);
    expect(reports.map((r) => r.how)).toEqual(["missed"]);
    expect(s.aiUse(s.getSession(session.id)!)).toMatchObject({ queries: 1, applies: 1, mutationsInjected: 1, mutationsCaught: 0 });

    // Fixing the line afterwards counts as caught.
    const fixed = proposal.newContent.replace(injected[0]!.payload.after, injected[0]!.payload.before);
    s.saveWorkspace({ type: "comprehension", slug: COMP, sessionId: session.id, files: { ...files, [proposal.path]: fixed } }, Date.now() + 60_000);
    reports = s.mutationReports(s.getSession(session.id)!);
    expect(reports.map((r) => r.how)).toEqual(["fixed"]);
  });

  it("fallible mode also mutates pasted replies (it works with every provider)", async () => {
    const s = await load();
    vi.stubEnv("SWEMOCK_FALLIBLE_RATE", "1");
    s.updateSettings(s.getDb(), { features: { voiceInput: false, fallibleMode: true } });
    judge.runProject.mockResolvedValue(run([]));
    const files = startFiles(s, "comprehension", COMP);
    const reader = files["reader.py"]!;
    const reply = `Here:\n\`\`\`python path=reader.py\n${reader.replace(/\n$/, "")}\ndef helper(values, start=0):\n    for i in range(len(values)):\n        if values[i] < 3:\n            start += 1\n    return start\n\`\`\`\n`;
    const turn = await s.pasteAssistantReply({ type: "comprehension", slug: COMP, text: reply, files });
    const session = s.activePracticeSession(s.getFluency("comprehension", COMP)!.id)!;
    expect(s.sessionEvents(session.id, "mutation_injected")).toHaveLength(1);
    expect(turn.proposals[0]!.newContent).not.toContain(reply.slice(reply.indexOf("def helper"), reply.indexOf("```\n", reply.indexOf("def helper"))).trimEnd());
  });

  it("a rejected hunk counts as caught", async () => {
    const s = await load({ fake: true });
    vi.stubEnv("SWEMOCK_FALLIBLE_RATE", "1");
    s.updateSettings(s.getDb(), { features: { voiceInput: false, fallibleMode: true } });
    judge.runProject.mockResolvedValue(run([]));
    const files = startFiles(s, "comprehension", COMP);
    const turn = await s.askAssistant({ type: "comprehension", slug: COMP, question: "add a helper", context: [{ path: "reader.py" }], files });
    const session = s.activePracticeSession(s.getFluency("comprehension", COMP)!.id)!;
    const proposal = turn.proposals[0]!;
    const hunks = computeHunks(proposal.base, proposal.newContent);
    s.logApply({ type: "comprehension", slug: COMP, sessionId: session.id, proposalId: proposal.id, path: proposal.path, accepted: [], rejected: hunks.map((h) => h.id) });
    expect(s.mutationReports(s.getSession(session.id)!).map((r) => r.how)).toEqual(["rejected"]);
    expect(s.aiUse(s.getSession(session.id)!)).toMatchObject({ mutationsInjected: 1, mutationsCaught: 1, hunksRejected: hunks.length });
  });

  it("a mutation that fails the sandbox parse check is never injected", async () => {
    const s = await load({ fake: true });
    vi.stubEnv("SWEMOCK_FALLIBLE_RATE", "1");
    s.updateSettings(s.getDb(), { features: { voiceInput: false, fallibleMode: true } });
    judge.runProject.mockResolvedValue(run([], 1));
    const files = startFiles(s, "comprehension", COMP);
    const turn = await s.askAssistant({ type: "comprehension", slug: COMP, question: "add a helper", context: [{ path: "reader.py" }], files });
    const session = s.activePracticeSession(s.getFluency("comprehension", COMP)!.id)!;
    expect(s.sessionEvents(session.id, "mutation_injected")).toHaveLength(0);
    expect(turn.proposals[0]!.newContent).toContain("fake_assistant_helper");
  });
});

describe("auto scores", () => {
  it("scores an extension attempt from the submissions in the log", async () => {
    const s = await load();
    judge.runProject.mockImplementation(async (req) => declared(req));
    const files = startFiles(s, "extension", EXT);
    const sub = await s.submit({ type: "extension", slug: EXT, files });
    const auto = s.fluencyAuto(s.getSession(sub.sessionId)!);
    const dims = Object.fromEntries(auto.scores.map((x) => [x.dimension, x.score]));
    expect(dims).toMatchObject({ acceptance: 4, regression: 4 });
    expect(auto.extension!.solved).toBe(true);
    expect(auto.lines.some((l) => l.startsWith("Acceptance tests:"))).toBe(true);
  });
});
