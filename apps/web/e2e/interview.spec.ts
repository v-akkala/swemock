import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { CONTENT, gradingReply, hintsOf, recordResponses, resetData, reference, setCode, setProvider, startInterview, submit, waitForEditor } from "./helpers";

/**
 * M3: AI layer and interviewer engine. Runs with provider "none" (scripted + packets) and with the
 * deterministic fake provider. The stack must allow the fake provider: SWEMOCK_TEST_MODE=1.
 */

const SLUG = "count-pairs-with-sum";

test.beforeAll(async ({ request }) => {
  await resetData(request);
});

/** Content that must never reach the browser before the round ends. */
function hiddenSnippets(slug: string): Record<string, string[]> {
  const dir = path.join(CONTENT, slug);
  const hidden = JSON.parse(fs.readFileSync(path.join(dir, "tests/hidden.json"), "utf8")) as { input: unknown }[];
  return {
    "hidden test input": hidden.map((h) => JSON.stringify(h.input)).filter((s) => s.length > 200).map((s) => s.slice(0, 120)),
    hint: hintsOf(slug).map((h) => h.slice(0, 60)),
    editorial: [fs.readFileSync(path.join(dir, "editorial.md"), "utf8").split("\n").find((l) => l.length > 60)!.slice(0, 60)],
    "reference solution": ["seen.get(target - x, 0)", "unordered_map<long long, long long> seen"],
    rubric: ["Restated the problem or confirmed it with a small example", "Stayed on a brute force without recognizing it was too slow"],
    "grader instructions": ["Grade this mock coding interview"],
  };
}

test.describe("first run", () => {
  test("the home page offers AI setup once, and it can be skipped", async ({ page }) => {
    await page.request.patch("/api/settings", { data: { onboardingDone: false } });
    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByTestId("ai-settings")).toContainText("Ollama");
    await page.getByTestId("setup-skip").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Practice interviews, locally." })).toBeVisible();
  });
});

test.describe("interview with the scripted interviewer (no AI)", () => {
  test("phases, chat, hints with penalty, follow-ups, debrief, self-score, and pasted grading; nothing hidden leaks", async ({ page }) => {
    await setProvider(page, "none");
    const rec = recordResponses(page);
    const id = await startInterview(page, SLUG, "Scripted interviewer");

    await expect(page.getByTestId("interview-timer")).toContainText(/^(49|50):/);
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Introductions");
    await expect(page.getByTestId("chat-log")).toContainText("50-minute coding interview");

    // Moving on posts the next phase's opening line.
    await page.getByTestId("next-phase").click();
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Clarifying questions");
    await expect(page.getByTestId("chat-log")).toContainText("what questions do you have");
    await page.getByTestId("chat-input").fill("Can nums be empty? How large can it get?");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("Which edge cases do you think matter");

    // Hints are available but cost points; the editorial is not.
    await page.getByRole("tab", { name: "hints" }).click();
    await expect(page.getByTestId("hint-penalty")).toBeVisible();
    await expect(page.getByTestId("reveal-editorial")).toHaveCount(0);
    await expect(page.getByTestId("give-up")).toHaveCount(0);

    // Solve: the interview moves on to testing with the problem's follow-up questions.
    await setCode(page, reference(SLUG, "python"));
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("verdict")).toHaveText("Samples passed", { timeout: 120_000 });
    await submit(page);
    await expect(page.getByTestId("verdict")).toHaveText("Accepted", { timeout: 120_000 });
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Testing and complexity", { timeout: 15_000 });
    await expect(page.getByTestId("chat-log")).toContainText("already sorted");

    // Before the round ends, no page or API response carried hidden content.
    const everything = rec.bodies.join("\n");
    expect(everything).toContain("Count Pairs With Sum"); // positive control
    for (const [what, snippets] of Object.entries(hiddenSnippets(SLUG))) {
      for (const s of snippets) expect(everything, `${what} leaked during the interview`).not.toContain(s);
    }
    // And the grading packet is refused while the round is live.
    const early = await page.request.post("/api/packets", { data: { kind: "dsa-grading", sessionId: id } });
    expect(early.status()).toBe(409);

    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(new RegExp(`/debrief/${id}$`));

    // Objective metrics only, until a self or AI score exists.
    await expect(page.getByTestId("scorecard")).toBeVisible();
    await expect(page.getByTestId("recommendation")).toContainText("Objective metrics only");
    await expect(page.getByTestId("metrics")).toContainText("Best submission");
    await expect(page.getByTestId("dim-correctness")).toContainText("auto 4");

    // Self-score with the revealed rubric.
    const checklist = page.getByTestId("self-checklist");
    for (const item of ["u-restate", "u-constraints", "u-edges", "a-before", "a-optimal", "x-time", "x-space", "t-samples", "m-narrate"]) {
      await checklist.locator(`[data-item="${item}"]`).check();
    }
    await page.getByTestId("save-self").click();
    await expect(page.getByTestId("recommendation")).not.toContainText("Objective metrics only");
    await expect(page.getByTestId("dim-understanding")).toContainText("self");

    // Grading packet: a bad reply is rejected with the text kept; a good one adds AI scores.
    const panel = page.getByTestId("packet-dsa-grading");
    await panel.getByTestId("copy-packet").click();
    await expect(panel).toContainText(/Copied|clipboard/);
    await panel.getByRole("textbox").last().fill("Looks good to me!");
    await panel.getByTestId("save-reply").click();
    await expect(panel.getByTestId("packet-error")).toContainText("json");
    await panel.getByRole("textbox").last().fill(gradingReply(3));
    await panel.getByTestId("save-reply").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("Clear plan", { timeout: 15_000 });
    await expect(page.getByTestId("dim-communication")).toContainText("ai 3");

    // Replay and the revealed reference material.
    await expect(page.getByTestId("replay")).toContainText("Conversation so far");
    await page.getByLabel("Timeline position").fill("0");
    await expect(page.getByTestId("replay")).toContainText("Phase: intro");
    await expect(page.getByText("Follow-up questions an interviewer might ask")).toBeVisible();

    // History lists it; redo starts a fresh interview.
    await page.goto("/history");
    await expect(page.getByTestId("history")).toContainText("Interview (scripted)");
    await page.goto(`/debrief/${id}`);
    await page.getByTestId("redo").click();
    await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
    expect(page.url()).not.toContain(id);
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(/\/debrief\//);
  });

  test("an interview in another chat: live packet, pasted transcript in the grading packet", async ({ page }) => {
    await setProvider(page, "none");
    const id = await startInterview(page, "balanced-brackets", "In another chat");
    const panel = page.getByTestId("packet-dsa-interview-live");
    await panel.getByTestId("copy-packet").click();
    await panel.getByText("Show the prompt").click();
    const live = await panel.locator("textarea[readonly]").inputValue();
    expect(live).toContain("Balanced Brackets");
    expect(live).not.toContain("Intuition"); // no editorial in a live packet
    await panel.getByLabel("Paste the conversation (optional, for grading)").fill("Interviewer: Hi!\nMe: I'd use a stack.");
    await panel.getByTestId("save-reply").click();
    await expect(panel).toContainText("Reply saved");
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(/\/debrief\//);
    const grading = await page.request.post("/api/packets", { data: { kind: "dsa-grading", sessionId: id } });
    expect((await grading.json()).markdown).toContain("I'd use a stack.");
  });
});

test.describe("interview with an AI interviewer (fake provider)", () => {
  test("streams replies, blocks leaks, grades with AI, and records token usage", async ({ page }) => {
    await setProvider(page, "fake");
    const rec = recordResponses(page);
    const id = await startInterview(page, SLUG, "AI interviewer");
    await waitForEditor(page);

    await page.getByTestId("chat-input").fill("I'd scan once with a hash map.");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("[fake interviewer] Thanks.", { timeout: 15_000 });

    // The fake model tries to paste the reference solution: the filter replaces the reply.
    await page.getByTestId("chat-input").fill("LEAK_TEST");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("I can't give that part away", { timeout: 15_000 });
    await expect(page.getByTestId("chat-log")).not.toContainText("countPairs");
    expect(rec.bodies.join("\n")).not.toContain("seen.get(target - x, 0)");

    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(new RegExp(`/debrief/${id}$`));
    await page.getByTestId("grade-ai").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("[fake]", { timeout: 30_000 });
    await expect(page.getByTestId("ai-feedback")).toContainText("Grader: fake");
    await expect(page.getByText(/Tokens used in this session/)).toBeVisible();
    await expect(page.getByTestId("replay")).toContainText("blocked by the leak filter");
  });

  test("falls back cleanly when the AI interviewer is unavailable", async ({ page }) => {
    await setProvider(page, "fake");
    await startInterview(page, "merge-ranges", "AI interviewer");
    await setProvider(page, "none"); // the provider disappears mid-interview
    await page.getByTestId("chat-input").fill("Hello?");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("ai-error")).toContainText("No AI provider is configured");
    await page.getByRole("button", { name: "Continue with the scripted interviewer" }).click();
    await expect(page.getByTestId("chat-log")).toContainText("Switched to the scripted interviewer");
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(/\/debrief\//);
  });
});

test.describe("approach check", () => {
  test("gives a verdict with a provider, and a copy-prompt packet without one", async ({ page }) => {
    await setProvider(page, "fake");
    await page.goto(`/dsa/${SLUG}`);
    await page.getByRole("tab", { name: "approach" }).click();
    await page.getByLabel("Your approach").fill("One pass with a hash map of counts.");
    await page.getByTestId("check-approach").click();
    await expect(page.getByTestId("approach-reply")).toContainText(/^Works\./);

    await setProvider(page, "none");
    await page.reload();
    await page.getByRole("tab", { name: "approach" }).click();
    await page.getByLabel("Your approach").fill("Try every pair of indices.");
    const panel = page.getByTestId("packet-approach-check");
    await panel.getByTestId("copy-packet").click();
    await panel.getByText("Show the prompt").click();
    await expect(panel.locator("textarea[readonly]")).toHaveValue(/Try every pair of indices/);
    await panel.getByLabel("Paste the verdict").fill("Works but suboptimal (O(n^2)).\nQuadratic in the worst case.");
    await panel.getByTestId("save-reply").click();
    await expect(panel).toContainText("Reply saved");
  });
});

test.describe("AI settings", () => {
  test("stores API keys encrypted and only ever shows a masked hint", async ({ page }) => {
    const secret = "sk-ant-e2e-not-a-real-key-7890";
    const rec = recordResponses(page);
    await page.request.patch("/api/settings", { data: { provider: "anthropic" } });
    await page.goto("/settings");
    await page.getByRole("textbox", { name: "API key" }).fill(secret);
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(page.getByText("Stored: ••••••••7890")).toBeVisible();
    await expect(page.getByText(/Models/)).toBeVisible();
    await page.reload();
    await expect(page.getByText("Stored: ••••••••7890")).toBeVisible();
    const status = await (await page.request.get("/api/ai/status")).text();
    expect(status).not.toContain(secret);
    expect(rec.bodies.join("\n")).not.toContain(secret);
    await page.request.delete("/api/ai/key", { data: { provider: "anthropic" } });
    await setProvider(page, "none");
  });
});
