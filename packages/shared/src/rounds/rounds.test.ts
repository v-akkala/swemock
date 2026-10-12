import { describe, expect, it } from "vitest";
import { coverage } from "./coverage";
import { parseResume, probeFor } from "./resume";
import { answerSignals, summarizeSignals } from "./signals";

const RESUME = `Jordan Rivera
jordan@example.com | github.com/jrivera

EDUCATION
State University — B.S. Computer Science, 2022 – 2026
Relevant coursework: Operating Systems, Databases

EXPERIENCE
Acme Cloud — Software Engineering Intern    Jun 2025 – Aug 2025
• Improved API latency by 40% by adding a Redis cache in front of the catalog service
• Worked on internal dashboards
• Led a team of 3 interns to build a cutting-edge scalable data pipeline that processes
  2M events per day
- Wrote unit tests

PROJECTS
Tiny Search (2024)
- Built a full-text search engine in C++ with an inverted index and BM25 ranking
- Leveraged innovative machine learning for ranking

SKILLS
Languages: Python, C++, SQL
Tools: Git, Docker | Linux
`;

describe("parseResume", () => {
  const r = parseResume(RESUME);

  it("finds the name, sections, entries, and skills", () => {
    expect(r.name).toBe("Jordan Rivera");
    expect(r.sections.map((s) => s.kind)).toEqual(["other", "education", "experience", "projects", "skills"]);
    const exp = r.sections.find((s) => s.kind === "experience")!;
    expect(exp.entries[0]).toMatchObject({ title: expect.stringContaining("Acme Cloud"), dates: "Jun 2025 – Aug 2025", bulletCount: 4 });
    expect(r.skills).toEqual(["Python", "C++", "SQL", "Git", "Docker", "Linux"]);
  });

  it("splits bullets by marker and glues wrapped lines", () => {
    const exp = r.sections.find((s) => s.kind === "experience")!;
    expect(exp.bullets.map((b) => b.text)).toContain("Led a team of 3 interns to build a cutting-edge scalable data pipeline that processes 2M events per day");
    expect(exp.bullets).toHaveLength(4);
  });

  it("flags metrics, claims, buzzwords, and vague wording", () => {
    const by = (start: string) => r.bullets.find((b) => b.text.startsWith(start))!;
    expect(by("Improved API latency").flags).toEqual(expect.arrayContaining(["metric", "strong-claim"]));
    expect(by("Worked on internal").flags).toContain("vague");
    expect(by("Led a team").flags).toEqual(expect.arrayContaining(["strong-claim", "buzzword", "metric"]));
    expect(by("Leveraged innovative").flags).toContain("buzzword");
    // Years aren't metrics.
    expect(parseResume("EXPERIENCE\nCo — Dev   2020 – 2022\n- Maintained the billing service for the finance team in 2021").bullets[0]!.flags).toEqual([]);
  });

  it("picks 2–3 probes spread over entries, metrics first", () => {
    expect(r.probes.length).toBeGreaterThanOrEqual(2);
    expect(r.probes.length).toBeLessThanOrEqual(3);
    expect(r.probes[0]!.flags).toContain("metric");
    expect(probeFor(r.probes[0]!)).toMatch(/^Tell me more about: “/);
  });

  it("treats prose paragraphs in experience as sentences", () => {
    const p = parseResume("EXPERIENCE\nAcme — Intern  2024 – 2025\nBuilt the onboarding flow used by every new customer. Cut support tickets by 30% over two quarters.");
    expect(p.bullets.map((b) => b.text)).toEqual(["Built the onboarding flow used by every new customer.", "Cut support tickets by 30% over two quarters."]);
  });

  it("copes with empty and heading-less text", () => {
    expect(parseResume("").bullets).toEqual([]);
    expect(parseResume("just a sentence").sections.length).toBeGreaterThan(0);
  });
});

describe("answerSignals", () => {
  it("counts words, I vs we, and numbers", () => {
    const s = answerSignals("I rewrote the parser and we shipped it in 2023. My change cut errors by 30 percent.", { durationMs: 95_000 });
    expect(s).toMatchObject({ words: 17, iCount: 2, weCount: 1, hasNumber: true, durationSec: 95, fillers: null, wpm: null });
    expect(s.iShare).toBeCloseTo(2 / 3);
    expect(answerSignals("We shipped it in 2023.").hasNumber).toBe(false);
  });

  it("reports fillers and pace only for voice answers", () => {
    const text = "Um, so basically I, like, uh led the migration. You know, it was kind of hard.";
    const typed = answerSignals(text);
    expect(typed.fillers).toBeNull();
    const voice = answerSignals(text, { voice: true, speechMs: 6000 });
    expect(voice.fillerBreakdown).toEqual({ um: 1, uh: 1, "you know": 1, "kind of": 1, basically: 1, like: 1 });
    expect(voice.fillers).toBe(6);
    expect(voice.wpm).toBe(160); // 16 words in 6 seconds
    expect(answerSignals("short", { voice: true, speechMs: 1000 }).wpm).toBeNull();
  });

  it("summarizes a session", () => {
    const m = summarizeSignals([
      answerSignals("I did it in 3 days.", { durationMs: 60_000 }),
      answerSignals("We did it.", { durationMs: 120_000 }),
    ]);
    expect(m).toMatchObject({ answers: 2, numberShare: 0.5, avgDurationSec: 90, voiceAnswers: 0, fillers: null });
    expect(m.iShare).toBeCloseTo(0.5);
  });
});

describe("coverage", () => {
  it("finds gaps, thin spots, and a story carrying the load", () => {
    const c = coverage([
      { id: "a", title: "Outage", competencies: ["ownership", "failure", "pressure", "teamwork"] },
      { id: "b", title: "Migration", competencies: ["ownership", "leadership"] },
    ]);
    expect(c.gaps).toContain("conflict");
    expect(c.gaps).not.toContain("ownership");
    expect(c.thin.sort()).toEqual(["failure", "leadership", "pressure", "teamwork"]);
    expect(c.overused).toEqual([{ storyId: "a", title: "Outage", soleFor: ["failure", "pressure", "teamwork"] }]);
  });
});

describe("feedback schemas", () => {
  it("validates the example shapes", async () => {
    const f = await import("./feedback");
    expect(f.resumeFeedbackSchema.safeParse(f.exampleResumeFeedback).success).toBe(true);
    expect(f.rewriteSchema.safeParse(f.exampleRewrite).success).toBe(true);
    expect(f.rewriteSchema.safeParse({ answers: [] }).success).toBe(false);
  });

  it("flags numbers that don't come from the source", async () => {
    const { unsupportedNumbers } = await import("./feedback");
    const source = ["I cut the build from 12 minutes to 4, which saved about 1,500 CI minutes a month."];
    expect(unsupportedNumbers("I cut the build from 12 to 4 minutes, saving 1500 CI minutes monthly.", source)).toEqual([]);
    expect(unsupportedNumbers("I cut build time by 66% across 20 repos.", source)).toEqual(["66", "20"]);
  });
});
