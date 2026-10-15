import { afterEach, describe, expect, it, vi } from "vitest";
import { freshTempDatabase } from "../test-utils";

const judge = vi.hoisted(() => ({ runProject: vi.fn() }));
vi.mock("../judge/client", () => ({ runProject: judge.runProject, runDsa: vi.fn(), JudgeError: class JudgeError extends Error {} }));

async function load() {
  freshTempDatabase();
  (await import("../content/sync")).ensureContentSynced({ force: true });
  return {
    ...(await import("./engine")),
    ...(await import("./phases")),
    ...(await import("./state")),
    ...(await import("./rounds/fluency")),
    ...(await import("../fluency/findings")),
    ...(await import("../fluency/service")),
    ...(await import("../content/fluency")),
    ...(await import("../packets")),
    ...(await import("../debrief")),
    ...(await import("../scoring/scorecard")),
    ...(await import("../dsa/store")),
  };
}

afterEach(() => vi.unstubAllEnvs());

const ITEMS = [
  ["comprehension", "csv-etl-pipeline"],
  ["review", "pr-search-endpoint"],
  ["extension", "todo-api"],
] as const;

describe("fluency phases", () => {
  it("scale the weights to the item's minutes and always sum to it", async () => {
    const s = await load();
    expect(s.fluencyPhases("comprehension", 60).map((p) => p.minutes)).toEqual([5, 30, 15, 10]);
    for (const type of ["comprehension", "review", "extension"] as const) {
      for (const minutes of [20, 33, 45, 90]) {
        const phases = s.fluencyPhases(type, minutes);
        expect(phases.reduce((n, p) => n + p.minutes, 0)).toBe(minutes);
        expect(phases.every((p) => p.minutes >= 1)).toBe(true);
      }
    }
  });
});

describe.each(ITEMS)("%s interview (%s)", (type, slug) => {
  it("opens with the scripted interviewer, advances on candidate messages, and keeps the live packet free of hidden content", async () => {
    const s = await load();
    const item = s.getFluency(type, slug)!;
    const session = s.startFluencyInterview({ type, slug, driver: "scripted", liveVia: "app", now: Date.now() - 5000 });
    const state = s.readState(session);
    expect(state.round).toEqual({ kind: "fluency", type, slug });
    expect(state.phases.reduce((n, p) => n + p.minutes, 0)).toBe(item.pub.minutes);

    const before = s.chatMessages(session.id);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((m) => m.from === "interviewer")).toBe(true);
    s.candidateSays(session.id, "Let me start by reading the code.", Date.now() - 3000);
    expect(s.chatMessages(session.id).length).toBeGreaterThan(before.length);

    const live = s.renderPacket({ kind: "fluency-live", sessionId: session.id }).markdown;
    const priv = s.getFluencyPrivate(type, slug) as unknown as { manifest?: { bugs: { title: string; explanation: string }[] }; issues?: { title: string; explanation: string }[]; hiddenTests?: Record<string, string>; bugTests?: Record<string, string> };
    for (const b of priv.manifest?.bugs ?? priv.issues ?? []) {
      expect(live).not.toContain(b.explanation);
      expect(live).not.toContain(b.title);
    }
    for (const t of Object.values(priv.hiddenTests ?? priv.bugTests ?? {})) for (const m of t.matchAll(/def (test_\w+)/g)) expect(live).not.toContain(m[1]!);
  });

  it("can't be graded while active, and the grading packet works after the round", async () => {
    const s = await load();
    const session = s.startFluencyInterview({ type, slug, driver: "scripted", liveVia: "app", now: Date.now() - 5000 });
    expect(() => s.renderPacket({ kind: "fluency-grading", sessionId: session.id })).toThrow(/after the round ends/);
    s.endInterview(session.id);
    const packet = s.renderPacket({ kind: "fluency-grading", sessionId: session.id });
    expect(packet.markdown).toContain("Dimension ids:");
    expect(packet.markdown).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("debrief and scorecard", () => {
  it("marks planted bugs found or missed, and the scorecard has the comprehension dimensions", async () => {
    const s = await load();
    const [type, slug] = ITEMS[0];
    const session = s.startFluencyInterview({ type, slug, driver: "scripted", liveVia: "app", now: Date.now() - 5000 });
    const priv = s.getFluencyPrivate(type, slug) as unknown as { manifest: { bugs: { id: string; file: string; lines: [number, number]; category: never; severity: never }[] } };
    const bug = priv.manifest.bugs[0]!;
    s.addFinding(session.id, { file: bug.file, lines: bug.lines, category: bug.category, severity: bug.severity, text: "off here" });
    s.endInterview(session.id);

    const debrief = s.loadDebrief(session.id)!;
    expect(debrief.fluency!.planted.find((p) => p.id === bug.id)!.status).toBe("found");
    expect(debrief.fluency!.planted.filter((p) => p.status === "missed")).toHaveLength(priv.manifest.bugs.length - 1);
    expect(debrief.problemHref).toBe(`/ai-fluency/${type}/${slug}`);
    expect(debrief.scorecard!.rubric.dimensions.map((d) => d.id)).toEqual(["summary", "bug_recall", "precision", "severity", "design", "ai_use", "communication"]);
    expect(debrief.scorecard!.scores.map((x) => x.dimension)).toEqual(expect.arrayContaining(["bug_recall", "precision"]));
  });

  it("an extension that never passed its tests can't recommend a hire", async () => {
    const s = await load();
    const [type, slug] = ITEMS[2];
    const session = s.startFluencyInterview({ type, slug, driver: "scripted", liveVia: "app", now: Date.now() - 5000 });
    s.endInterview(session.id);
    const card = s.loadDebrief(session.id)!.scorecard!;
    expect(card.recommendation === null || ["no_hire", "lean_no_hire"].includes(card.recommendation)).toBe(true);
  });
});
