import { afterEach, describe, expect, it, vi } from "vitest";
import { freshTempDatabase } from "../test-utils";

vi.mock("../judge/client", () => ({ runDsa: vi.fn(), JudgeError: class JudgeError extends Error {} }));

const RESUME = `Jordan Rivera
jordan@example.com

EXPERIENCE
Acme Cloud — Software Engineering Intern    Jun 2025 – Aug 2025
• Improved API latency by 40% by adding a Redis cache in front of the catalog service
• Worked on internal dashboards
• Led a team of 3 interns to build a scalable data pipeline that processes 2M events per day

PROJECTS
Tiny Search (2024)
- Built a full-text search engine in C++ with an inverted index and BM25 ranking

SKILLS
Python, C++, SQL
`;

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
    ...(await import("./state")),
    ...(await import("./rounds/recruiter")),
    ...(await import("./rounds/behavioral")),
    ...(await import("./answers")),
    ...(await import("../dsa/store")),
    ...(await import("../packets")),
    ...(await import("../scoring/scorecard")),
    ...(await import("../debrief")),
    ...(await import("../stories")),
    ...(await import("../resume/store")),
    ...(await import("../content/questions")),
  };
}

type S = Awaited<ReturnType<typeof load>>;
type Recruiter = import("./state").RecruiterRound;
type Behavioral = import("./state").BehavioralRound;

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

afterEach(() => vi.unstubAllEnvs());

// A deterministic "random": the same order every run.
const rng = () => 0.42;
const MIN = 60_000;
// Events in the same millisecond have no defined order, so tests move the clock forward a second per step.
let clock = 0;
const tick = () => (clock = Math.max(Date.now(), clock) + 1000);
const ANSWER =
  "I led the migration of our billing service from a monolith to separate services, and I wrote the cutover plan myself. We shipped it in six weeks, cut incidents by 30 percent, and I would involve support earlier next time.";

describe("recruiter screen, scripted", () => {
  const start = (s: S, extra: Record<string, unknown> = {}) =>
    s.startRecruiter({ resumeText: RESUME, resumeTitle: "Jordan v1", role: "New grad SWE", company: "Globex", jobDescription: "", driver: "scripted", liveVia: "app", rng, ...extra });
  const round = (s: S, id: string) => s.readState(s.getSession(id)!).round as Recruiter;

  it("opens with the greeting and walks the resume lines: deep dives, motivation, logistics", async () => {
    const s = await load();
    const session = start(s);
    expect(session.roundType).toBe("recruiter");
    expect(s.chatMessages(session.id).map((m) => m.text)).toEqual([expect.stringContaining("tell me about yourself")]);
    const r = round(s, session.id);
    expect(r.pool.length).toBe(Math.min(12, s.listCs().length));
    expect(new Set(r.pool.map((p) => p.difficulty))).toEqual(new Set(["easy", "medium", "hard"]));
    expect(r.probeBullets.length).toBeGreaterThanOrEqual(2);

    const said: string[] = [];
    for (let i = 0; i < r.resumeLines.length - 1; i++) {
      s.candidateSays(session.id, "Some answer.", tick());
      said.push(s.chatMessages(session.id).at(-1)!.text);
    }
    expect(said[0]).toMatch(/^Tell me more about: “/);
    expect(said.some((t) => t.includes("Why Globex"))).toBe(true);
    expect(said.filter((t) => /logistics|timeline/i.test(t)).length).toBe(2);
    expect(s.chatMessages(session.id).filter((m) => m.tag === "probe").length).toBe(r.probeBullets.length);
  });

  it("moves to fundamentals when the resume lines run out, reveals key points, and adapts to self-grades", async () => {
    const s = await load();
    const session = start(s);
    const lines = round(s, session.id).resumeLines.length;
    for (let i = 0; i < lines; i++) s.candidateSays(session.id, "Some answer.", tick());

    let { state } = s.settleInterview(session.id);
    expect(state.phases[state.phaseIndex]!.id).toBe("fundamentals");
    let msgs = s.chatMessages(session.id);
    expect(msgs.at(-1)).toMatchObject({ from: "interviewer", tag: "cs" });
    expect(msgs.at(-1)!.text).toContain("Question 1:");
    const first = round(s, session.id).current!;
    expect(s.getCsPublic(first)!.difficulty).toBe("easy");

    // Answer: the key points are revealed, and the candidate must grade before the next question.
    s.candidateSays(session.id, "My best attempt at an answer.", tick());
    msgs = s.chatMessages(session.id);
    expect(msgs.at(-1)).toMatchObject({ tag: "cs-reveal" });
    for (const kp of s.getCsPrivate(first)!.keyPoints) expect(msgs.at(-1)!.text).toContain(kp);
    s.candidateSays(session.id, "Another thought.", tick());
    expect(s.chatMessages(session.id).at(-1)!.text).toMatch(/Grade yourself/);
    expect(() => s.gradeFundamentalsQuestion(session.id, "no-such-question", 2, tick())).toThrow(/isn't waiting/);

    s.gradeFundamentalsQuestion(session.id, first, 2, tick());
    ({ state } = s.settleInterview(session.id));
    const r1 = state.round as Recruiter;
    expect(r1).toMatchObject({ level: 1, pending: null, grades: { [first]: 2 } });
    expect(s.getCsPublic(r1.current!)!.difficulty).toBe("medium");

    // Missing the next one steps the level back down.
    s.candidateSays(session.id, "No idea.", tick());
    s.gradeFundamentalsQuestion(session.id, r1.current!, 0, tick());
    const r2 = round(s, session.id);
    expect(r2.level).toBe(0);
    expect(new Set(r2.asked).size).toBe(r2.asked.length);

    const card = s.loadScorecard(session.id);
    expect(card.final.fundamentals).toMatchObject({ source: "auto" });
    expect(card.metricLines.join("\n")).toMatch(/Self-graded: 1 got it, 0 partly, 1 missed/);
    expect(card.recommendation).toBeNull();
  });

  it("starts fundamentals by itself when the resume phase runs out of time", async () => {
    const s = await load();
    const t0 = Date.now();
    const session = start(s, { now: t0 });
    const { state } = s.settleInterview(session.id, t0 + 10 * MIN + 5);
    expect(state.phases[state.phaseIndex]!.id).toBe("fundamentals");
    const msgs = s.chatMessages(session.id);
    expect(msgs.at(-2)).toMatchObject({ from: "system" });
    expect(msgs.at(-1)).toMatchObject({ tag: "cs" });
  });

  it("rejects a resume that's too short", async () => {
    const s = await load();
    expect(() => start(s, { resumeText: "hi" })).toThrow(/Add your resume/);
  });

  it("wraps up with the candidate's questions and a debrief that reveals what was asked", async () => {
    const s = await load();
    const session = start(s);
    s.advancePhase(session.id, tick());
    const asked = round(s, session.id).current!;
    s.candidateSays(session.id, "A real attempt at the first question.", tick());
    s.gradeFundamentalsQuestion(session.id, asked, 1, tick());
    s.advancePhase(session.id, tick());
    expect(s.chatMessages(session.id).at(-1)!.text).toContain("questions for me");
    s.candidateSays(session.id, "What does the team work on?", tick());
    s.endInterview(session.id, tick());

    const d = s.loadDebrief(session.id)!;
    expect(d.roundType).toBe("recruiter");
    expect(d.title).toBe("Recruiter screen");
    expect(d.recruiter!.questions[0]).toMatchObject({ id: asked, grade: 1, answer: "A real attempt at the first question." });
    expect(d.recruiter!.questions[0]!.keyPoints.length).toBeGreaterThan(1);
    expect(d.recruiter!.probes.length).toBeGreaterThan(0);
    expect(d.scorecard!.rubric.id).toBe("recruiter-screen");
  });
});

describe("behavioral interview, scripted", () => {
  const start = (s: S, extra: Record<string, unknown> = {}) => s.startBehavioral({ count: 4, driver: "scripted", liveVia: "app", rng, ...extra });
  const round = (s: S, id: string) => s.readState(s.getSession(id)!).round as Behavioral;

  it("greets, then asks the questions with up to two follow-ups chosen from what the answer lacked", async () => {
    const s = await load();
    const session = start(s);
    const r = round(s, session.id);
    expect(r.config.questionIds).toHaveLength(4);
    expect(new Set(r.config.questionIds.map((id) => s.getBehavioralPublic(id)!.competencies[0])).size).toBe(4);
    expect(s.settleInterview(session.id).state.phases.map((p) => p.minutes)).toEqual([2, 24, 3]);
    expect(s.chatMessages(session.id)[0]!.text).toContain("4 behavioral questions");

    s.candidateSays(session.id, "Ready.", tick());
    let msgs = s.chatMessages(session.id);
    expect(msgs.at(-1)).toMatchObject({ tag: "behavioral" });
    expect(msgs.at(-1)!.text).toContain("Question 1 of 4");

    // An answer with no "I" and no number draws the ownership probe, then the result probe.
    s.candidateSays(session.id, "The team handled it together and it went fine in the end.", tick());
    expect(s.chatMessages(session.id).at(-1)).toMatchObject({ tag: "followup" });
    expect(s.chatMessages(session.id).at(-1)!.text).toContain("What did YOU specifically do");
    s.candidateSays(session.id, "We shared the work and it went fine.", tick());
    expect(s.chatMessages(session.id).at(-1)!.text).toContain("measurable result");
    // Two follow-ups used: the next message moves to question 2.
    s.candidateSays(session.id, ANSWER, tick());
    expect(s.chatMessages(session.id).at(-1)!.text).toContain("Question 2 of 4");

    // A strong answer (I, a number) draws an authored follow-up instead of a generic one.
    s.candidateSays(session.id, ANSWER, tick());
    msgs = s.chatMessages(session.id);
    const authored = s.getBehavioralPrivate(r.config.questionIds[1]!)!.followUps;
    expect(authored).toContain(msgs.at(-1)!.text);
  });

  it("closes after the last question and records auto signals, including voice", async () => {
    const s = await load();
    const session = start(s);
    s.candidateSays(session.id, "Ready.", tick());
    const now = tick();
    for (let q = 0; q < 4; q++) {
      // Each strong answer gets two authored follow-ups; the third answer moves to the next question.
      s.candidateSays(session.id, ANSWER, now + (q * 6 + 1) * 1000, q === 0 ? { voice: true, speechMs: 20_000 } : {});
      s.candidateSays(session.id, ANSWER, now + (q * 6 + 3) * 1000);
      s.candidateSays(session.id, ANSWER, now + (q * 6 + 5) * 1000);
    }
    const { state } = s.settleInterview(session.id);
    expect(state.phases[state.phaseIndex]!.id).toBe("wrapup");
    expect(s.chatMessages(session.id).some((m) => m.text.includes("that's all the questions I had"))).toBe(true);

    s.endInterview(session.id, tick());
    const turns = s.answerTurns(session.id).filter((t) => t.counts);
    expect(turns.length).toBeGreaterThan(8);
    expect(turns[0]!.signals).toMatchObject({ hasNumber: true });
    const voiced = turns.find((t) => t.signals.fillers !== null)!;
    expect(voiced.signals.wpm).toBeGreaterThan(0);

    const card = s.loadScorecard(session.id);
    // "our" counts as a "we" word: 4 of 6 first-person pronouns are "I".
    expect(card.final.ownership).toMatchObject({ source: "auto", score: 3 });
    expect(card.final.impact).toMatchObject({ source: "auto" });
    expect(card.metricLines.join("\n")).toMatch(/Filler words \(voice\)/);
    expect(card.rubric.id).toBe("behavioral");
  });

  it("replays the same questions on redo, and puts requested competencies first", async () => {
    const s = await load();
    const bank = s.listBehavioral();
    const session = start(s, { focus: ["failure"], count: 4 });
    const ids = round(s, session.id).config.questionIds;
    const failure = bank.filter((b) => b.competencies.includes("failure")).map((b) => b.slug);
    expect(failure.length).toBeGreaterThan(0);
    expect(ids.some((id) => failure.includes(id))).toBe(true);
    const again = start(s, { questionIds: ids });
    expect(round(s, again.id).config.questionIds).toEqual(ids);
  });
});

describe("AI interviewer in the conversation rounds (fake provider)", () => {
  it("behavioral: the first reply opens the questions phase before the model answers", async () => {
    const s = await load("fake");
    const session = s.startBehavioral({ count: 4, driver: "llm", liveVia: "app", rng });
    const events = await collect(s.interviewerReply(session.id, "Ready when you are."));
    expect(events.some((e) => e.type === "delta")).toBe(true);
    const { state } = s.settleInterview(session.id);
    expect(state.phases[state.phaseIndex]!.id).toBe("questions");
    const log = s.chatMessages(session.id);
    expect(log.map((m) => m.from)).toEqual(["interviewer", "candidate", "system", "interviewer"]);
    expect(log.at(-1)!.text).toContain("[fake interviewer]");
  });

  it("recruiter: key points never reach the candidate through the AI", async () => {
    const s = await load("fake");
    const session = s.startRecruiter({ resumeText: RESUME, role: "SWE intern", driver: "llm", liveVia: "app", rng });
    const events = await collect(s.interviewerReply(session.id, "LEAK_TEST please"));
    const last = s.chatMessages(session.id).at(-1)!;
    expect(last.filtered).toBe(true);
    const shown = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    const pool = (s.readState(s.getSession(session.id)!).round as Recruiter).pool;
    for (const p of pool) for (const kp of s.getCsPrivate(p.id)!.keyPoints) expect(shown + last.text).not.toContain(kp.slice(0, 40));
  });

  it("behavioral: strong-answer signals never reach the candidate through the AI", async () => {
    const s = await load("fake");
    const session = s.startBehavioral({ count: 4, driver: "llm", liveVia: "app", rng });
    await collect(s.interviewerReply(session.id, "LEAK_TEST please"));
    expect(s.chatMessages(session.id).at(-1)!.filtered).toBe(true);
  });
});

describe("packets for the conversation rounds", () => {
  it("recruiter: the live packet has the resume and questions but no key points; grading waits for the end and validates against the recruiter rubric", async () => {
    const s = await load();
    const session = s.startRecruiter({ resumeText: RESUME, resumeTitle: "Jordan v1", role: "New grad SWE", company: "Globex", driver: "scripted", liveVia: "packet", rng });
    const live = s.renderPacket({ kind: "recruiter-live", sessionId: session.id });
    expect(live.markdown).toContain("Improved API latency by 40%");
    expect(live.markdown).toContain("Globex");
    const pool = (s.readState(s.getSession(session.id)!).round as Recruiter).pool;
    for (const p of pool) for (const kp of s.getCsPrivate(p.id)!.keyPoints) expect(live.markdown).not.toContain(kp);
    expect(() => s.renderPacket({ kind: "recruiter-grading", sessionId: session.id })).toThrow(/after the interview ends/);
    expect(() => s.renderPacket({ kind: "behavioral-live", sessionId: session.id })).toThrow(/doesn't belong/);

    s.endInterview(session.id, tick());
    const grading = s.renderPacket({ kind: "recruiter-grading", sessionId: session.id });
    expect(grading.markdown).toContain("Dimension ids: communication, resume_depth, motivation, fundamentals");
    expect(grading.markdown).toContain(s.getCsPrivate(pool[0]!.id)!.keyPoints[0]!);
    expect(() => s.renderPacket({ kind: "recruiter-live", sessionId: session.id })).toThrow(/ended/);

    const dims = ["communication", "resume_depth", "motivation", "fundamentals"];
    const grade = { dimensions: dims.map((id) => ({ id, score: 3, evidence: ["[01:00] ok"] })), recommendation: "lean_hire", strengths: ["a", "b", "c"], improvements: ["a", "b", "c"], strong_candidate: "x" };
    const bad = s.pasteReply(session.id, "recruiter-grading", "```json\n" + JSON.stringify({ ...grade, dimensions: grade.dimensions.slice(1) }) + "\n```");
    expect(bad).toMatchObject({ ok: false, error: expect.stringContaining("missing dimension(s): communication") });
    const ok = s.pasteReply(session.id, "recruiter-grading", "Thoughts.\n```json\n" + JSON.stringify(grade) + "\n```");
    expect(ok).toMatchObject({ ok: true, scorecard: { recommendation: "lean_hire", sources: expect.arrayContaining(["ai"]) } });
  });

  it("recruiter: pasted resume feedback is validated, and invented numbers are rejected", async () => {
    const s = await load();
    const session = s.startRecruiter({ resumeText: RESUME, role: "SWE intern", driver: "scripted", liveVia: "app", rng });
    expect(() => s.renderPacket({ kind: "resume-feedback", sessionId: session.id })).toThrow(/after the interview ends/);
    s.candidateSays(session.id, "I cut latency by forty percent using a Redis cache, measured with our dashboards.", tick());
    s.endInterview(session.id, tick());
    const packet = s.renderPacket({ kind: "resume-feedback", sessionId: session.id });
    expect(packet.markdown).toContain("Bullets the recruiter probed");
    const fb = (rewrite: string) => ({
      bullets: [{ original: "Improved API latency by 40%", drew_followup: true, could_back_up: "partly", problem: "No baseline", rewrite, needs_from_candidate: ["The baseline latency"] }],
      summary: "Lead with your contribution.",
    });
    const fabricated = s.pasteReply(session.id, "resume-feedback", "```json\n" + JSON.stringify(fb("Cut API latency by 40% to 120 ms by adding a Redis cache")) + "\n```");
    expect(fabricated).toMatchObject({ ok: false, error: expect.stringContaining('"120"') });
    const honest = s.pasteReply(session.id, "resume-feedback", "```json\n" + JSON.stringify(fb("Cut API latency by 40% by adding a Redis cache in front of the catalog service")) + "\n```");
    expect(honest.ok).toBe(true);
    expect(s.loadDebrief(session.id)!.recruiter!.feedback!.result.bullets[0]!.rewrite).toContain("Redis cache");
  });

  it("behavioral: live packet lists questions and follow-ups without signals; the rewrite packet carries the story notes", async () => {
    const s = await load();
    s.saveStory({ title: "Billing migration", situation: "Monolith", task: "Split it", action: "I wrote the plan", result: "Incidents down 30%", metrics: "30% fewer incidents", reflection: "", competencies: ["ownership", "failure", "conflict", "pressure", "leadership", "feedback"] });
    const session = s.startBehavioral({ count: 4, driver: "scripted", liveVia: "packet", rng, lens: "amazon" });
    const ids = (s.readState(s.getSession(session.id)!).round as Behavioral).config.questionIds;
    const live = s.renderPacket({ kind: "behavioral-live", sessionId: session.id });
    expect(live.markdown).toContain("Question 2 of 4");
    expect(live.markdown).toContain("amazon");
    for (const id of ids) {
      expect(live.markdown).toContain(s.getBehavioralPrivate(id)!.followUps[0]!);
      for (const sig of s.getBehavioralPrivate(id)!.strongSignals) expect(live.markdown).not.toContain(sig);
    }
    s.pasteReply(session.id, "behavioral-live", "Interviewer: Tell me about a time...\nCandidate: I led the billing migration and cut incidents by 30%.");
    s.endInterview(session.id, tick());
    const rewrite = s.renderPacket({ kind: "behavioral-rewrite", sessionId: session.id });
    expect(rewrite.markdown).toContain("Billing migration");
    expect(rewrite.markdown).toContain("cut incidents by 30%");
    const grading = s.renderPacket({ kind: "behavioral-grading", sessionId: session.id });
    expect(grading.markdown).toContain(s.getBehavioralPrivate(ids[0]!)!.strongSignals[0]!);

    const ok = s.pasteReply(session.id, "behavioral-rewrite", "```json\n" + JSON.stringify({ answers: [{ question: "Q1", stronger_version: "I led the billing migration and cut incidents by 30%.", missing_facts: ["How long it took"] }] }) + "\n```");
    expect(ok.ok).toBe(true);
    const bad = s.pasteReply(session.id, "behavioral-rewrite", "```json\n" + JSON.stringify({ answers: [{ question: "Q1", stronger_version: "I led the migration and cut incidents by 55% across 12 teams.", missing_facts: [] }] }) + "\n```");
    expect(bad).toMatchObject({ ok: false, error: expect.stringContaining('"55"') });
    expect(s.loadDebrief(session.id)!.behavioral!.rewrites!.result.answers).toHaveLength(1);
  });

  it("connected: grading and rewrites run through the fake provider", async () => {
    const s = await load("fake");
    const session = s.startBehavioral({ count: 4, driver: "scripted", liveVia: "app", rng });
    s.candidateSays(session.id, "Ready.", tick());
    s.candidateSays(session.id, ANSWER, tick());
    s.endInterview(session.id, tick());
    const card = await s.gradeWithAi(session.id);
    expect(card.sources).toContain("ai");
    expect(Object.keys(card.final).sort()).toEqual(card.rubric.dimensions.map((d) => d.id).sort());
    const fb = (await s.feedbackWithAi(session.id, "behavioral-rewrite")) as { answers: { stronger_version: string }[] };
    expect(fb.answers[0]!.stronger_version).toContain("billing service");
    expect(s.loadDebrief(session.id)!.behavioral!.rewrites!.via).toBe("ai");
  });
});

describe("story bank", () => {
  it("saves, updates, and reports coverage gaps and over-reliance", async () => {
    const s = await load();
    const blank = { situation: "", task: "", result: "", metrics: "", reflection: "" };
    const a = s.saveStory({ ...blank, title: "Outage", action: "I fixed it", competencies: ["failure", "pressure", "ownership", "teamwork"] });
    s.saveStory({ ...blank, title: "Migration", action: "", competencies: ["ownership"] });
    const cov = s.storyCoverage();
    expect(cov.coverage.gaps).toContain("conflict");
    expect(cov.coverage.overused[0]).toMatchObject({ storyId: a.id, soleFor: ["failure", "pressure", "teamwork"] });
    s.saveStory({ ...blank, title: "Outage (v2)", action: "", competencies: ["failure"] }, a.id);
    expect(s.storyCoverage().coverage.overused).toEqual([]);
    expect(() => s.saveStory({ ...blank, title: "x1", action: "", competencies: [] }, "missing")).toThrow(/doesn't exist/);
    s.deleteStory(a.id);
    expect(s.listStories()).toHaveLength(1);
  });
});

describe("resume versions", () => {
  it("numbers versions, parses on save, and keeps old versions", async () => {
    const s = await load();
    const v1 = s.saveResume({ title: "", text: RESUME, source: "paste" });
    const v2 = s.saveResume({ title: "Tailored", text: `${RESUME}\n- Added bullet about 10x throughput`, source: "pdf" });
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v1.title).toBe("Resume v1");
    expect(v1.parsed.probes.length).toBeGreaterThan(0);
    expect(s.listResumes().map((r) => r.version)).toEqual([2, 1]);
    expect(() => s.saveResume({ title: "x", text: "too short", source: "paste" })).toThrow(/too short/);
    s.deleteResume(v1.id);
    expect(s.listResumes()).toHaveLength(1);
  });
});
