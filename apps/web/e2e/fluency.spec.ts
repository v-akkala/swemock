import { expect, test, type Page } from "@playwright/test";
import {
  fluencyFile,
  fluencyHidden,
  fluencyReference,
  fluencySlugs,
  plantedOf,
  recordResponses,
  resetData,
  setFallible,
  setProvider,
  setWorkspaceFile,
  startFluencyInterview,
  type FluencyKind,
} from "./helpers";

/**
 * M6: AI Fluency. Code comprehension, AI-generated code review, and feature extension: the shared
 * workspace, the assistant (packet flow and the fake provider), fallible mode, interviews, and the debrief,
 * with the real judge. Hidden bug explanations, bug tests and reference code must never reach the browser
 * before the debrief.
 */

const COMP = "csv-etl-pipeline";
const REVIEW = "pr-search-endpoint";
const EXT = "todo-api";

test.beforeAll(async ({ request }) => {
  await resetData(request);
});
test.afterEach(async ({ page }) => {
  await setFallible(page, false);
  await setProvider(page, "none");
});

const item = (type: FluencyKind, slug: string) => `/ai-fluency/${type}/${slug}`;

async function finish(page: Page): Promise<string> {
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("finish").click();
  await page.waitForURL(/\/debrief\/[A-Z0-9]+$/);
  return page.url().split("/").pop()!;
}

/** Adds a finding through the form: open the file, press "Add finding", set the lines, fill, save. */
async function addFinding(page: Page, file: string, lines: [number, number], category: string, severity: string, text: string) {
  await page.getByTestId(`tree-${file}`).click();
  await page.getByTestId("add-finding").click();
  await page.getByTestId("finding-from").fill(String(lines[0]));
  await page.getByTestId("finding-to").fill(String(lines[1]));
  await page.getByTestId("finding-category").selectOption(category);
  await page.getByTestId("finding-severity").selectOption(severity);
  await page.getByTestId("finding-text").fill(text);
  await page.getByTestId("save-finding").click();
  await expect(page.getByTestId("findings-list")).toContainText(text);
}

function expectNoLeak(bodies: string[], needles: string[]) {
  const all = bodies.join("\n");
  for (const n of needles) {
    expect(all, `leaked: ${n}`).not.toContain(n);
    expect(all, `leaked (escaped): ${n}`).not.toContain(JSON.stringify(n).slice(1, -1));
  }
}

test.describe("list and settings", () => {
  test("lists every item in three sections, and fallible mode is a persisted setting that is off by default", async ({ page }) => {
    await page.goto("/ai-fluency");
    for (const type of ["comprehension", "review", "extension"] as const) {
      const slugs = fluencySlugs(type);
      expect(slugs.length).toBeGreaterThanOrEqual(4);
      for (const slug of slugs) await expect(page.getByTestId(`section-${type}`).locator(`a[href="${item(type, slug)}"]`)).toBeVisible();
    }
    await page.goto("/settings");
    const flag = page.getByTestId("fallible-flag");
    await expect(flag).not.toBeChecked();
    await flag.check();
    await page.reload();
    await expect(page.getByTestId("fallible-flag")).toBeChecked();
    await page.getByTestId("fallible-flag").uncheck();
    await page.reload();
    await expect(page.getByTestId("fallible-flag")).not.toBeChecked();
  });
});

test.describe("code comprehension (practice)", () => {
  test("run tests, annotate bugs, write a summary, use the assistant by packet, and read the debrief", async ({ page }) => {
    await setProvider(page, "none");
    const rec = recordResponses(page);
    const planted = plantedOf("comprehension", COMP);
    expect(planted.length).toBeGreaterThanOrEqual(4);
    const [first, second] = planted as [(typeof planted)[number], (typeof planted)[number]];

    await page.goto(item("comprehension", COMP));
    await expect(page.getByRole("heading", { name: "CSV Sales Pipeline" })).toBeVisible();
    await expect(page.getByTestId("file-tree")).toContainText("reader.py");
    await expect(page.getByTestId("file-tree")).toContainText("tests/test_pipeline.py");

    // The shipping tests run and pass on the buggy code; there is nothing to submit.
    await page.getByTestId("cmd-tests").click();
    await expect(page.getByTestId("verdict")).toContainText(/^\d+\/\d+ passed$/, { timeout: 120_000 });
    const verdict = (await page.getByTestId("verdict").textContent())!;
    const [a, b] = verdict.split(" ")[0]!.split("/");
    expect(a).toBe(b);
    await expect(page.getByTestId("submit-button")).toHaveCount(0);

    // One exact finding, and one in the right place with the wrong category (borderline).
    await addFinding(page, first.file, first.lines, first.category, first.severity, "the last row is dropped");
    const wrong = first.category === "style" ? "logic-error" : "style";
    await addFinding(page, second.file, second.lines, wrong, "low", "something is off here");
    await page.getByRole("tab", { name: /findings/ }).click();
    await expect(page.getByTestId("finding")).toHaveCount(2);

    await page.getByRole("tab", { name: "summary" }).click();
    await page.getByTestId("summary").fill("Reads CSV sales rows, validates them, aggregates per customer, and prints a report.");
    await page.getByTestId("summary").blur();

    // Assistant without a model: a packet to copy, a pasted reply, a diff preview with per-hunk choices.
    await page.getByTestId("tree-reader.py").click();
    await page.getByTestId("add-context").click();
    await expect(page.getByTestId("context-chips")).toContainText("reader.py");
    await page.getByTestId("assistant-question").fill("Add a comment at the top of this file.");
    await page.getByTestId("ask-ai").click();
    await expect(page.getByTestId("assistant-packet")).toBeVisible();
    await page.getByTestId("assistant-packet").getByText("Show the prompt").click();
    const packet = await page.getByTestId("assistant-packet-text").inputValue();
    expect(packet).toContain("Add a comment at the top of this file.");
    expect(packet).toContain("### reader.py");
    const reader = fluencyFile("comprehension", COMP, "reader.py");
    await page.getByTestId("assistant-paste").fill(`Sure:\n\`\`\`python path=reader.py\n# Reads the raw CSV.\n${reader}\`\`\`\n`);
    await page.getByTestId("save-assistant-reply").click();
    await expect(page.getByTestId("diff-preview")).toBeVisible();
    await expect(page.getByTestId("diff-preview")).toContainText("Add at line 1");
    await page.locator('[data-testid^="apply-"]').click();
    await expect(page.getByTestId("diff-preview")).toHaveCount(0);

    // Nothing hidden has reached the browser so far.
    expectNoLeak(rec.bodies, fluencyHidden("comprehension", COMP));

    const id = await finish(page);
    await expect(page.getByTestId("planted")).toBeVisible();
    await expect(page.getByTestId(`planted-${first.id}`)).toHaveAttribute("data-status", "found");
    await expect(page.getByTestId(`planted-${second.id}`)).toHaveAttribute("data-status", "borderline");
    await expect(page.getByTestId(`planted-${planted.at(-1)!.id}`)).toHaveAttribute("data-status", "missed");
    await expect(page.getByTestId("assistant-entry")).toContainText("Add a comment at the top of this file.");
    await expect(page.getByTestId("assistant-entry")).toContainText("applied 1 hunk");
    await expect(page.getByTestId("mutations")).toHaveCount(0);
    await expect(page.getByTestId("dim-bug_recall")).toContainText("auto");

    // The borderline match is the candidate's call.
    const borderline = page.getByTestId("borderline");
    await expect(borderline).toBeVisible();
    await borderline.getByTestId("confirm-match").click();
    await expect(page.getByTestId("your-finding").filter({ hasText: "something is off here" })).toHaveAttribute("data-verdict", "match");
    await expect(page.getByTestId("fluency-review")).toBeVisible();
    expect(id).toMatch(/^[A-Z0-9]+$/);
  });
});

test.describe("fallible mode", () => {
  /** Asks for code; returns the raw body of the ask response (what the browser is told). */
  async function askForCode(page: Page): Promise<string> {
    await page.goto(item("comprehension", COMP));
    await page.getByTestId("tree-reader.py").click();
    await page.getByTestId("add-context").click();
    await page.getByTestId("assistant-question").fill("Please add a helper to reader.py");
    const answered = page.waitForResponse((r) => r.url().includes("/api/fluency/") && r.url().endsWith("/ask"));
    await page.getByTestId("ask-ai").click();
    const body = await (await answered).text();
    await expect(page.getByTestId("assistant-reply")).toContainText("[fake assistant]", { timeout: 30_000 });
    await expect(page.getByTestId("diff-preview")).toBeVisible();
    return body;
  }

  test("a mistake is slipped into the code, stays hidden until the debrief, and accepting it is a miss", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "fake");
    await setFallible(page, true);
    const asked = await askForCode(page);
    await expect(page.getByTestId("diff-preview")).toContainText("fake_assistant_helper");
    // The browser is told nothing about the injected mistake.
    expect(asked).not.toMatch(/mutation|injected|"op"/);
    await page.locator('[data-testid^="apply-"]').click();
    const id = await finish(page);
    const mutation = page.getByTestId("mutation");
    await expect(mutation).toHaveCount(1);
    await expect(mutation).toHaveAttribute("data-caught", "false");
    await expect(mutation).toContainText("Missed");
    expect(id).toBeTruthy();
  });

  test("rejecting the changed hunk catches it", async ({ page }) => {
    await setProvider(page, "fake");
    await setFallible(page, true);
    await askForCode(page);
    await page.getByRole("button", { name: "Reject all" }).click();
    await page.locator('[data-testid^="apply-"]').click();
    await finish(page);
    await expect(page.getByTestId("mutation")).toHaveAttribute("data-caught", "true");
    await expect(page.getByTestId("mutation")).toContainText("you rejected it");
  });

  test("with fallible mode off, replies are untouched", async ({ page }) => {
    await setProvider(page, "fake");
    await setFallible(page, false);
    await askForCode(page);
    await page.locator('[data-testid^="apply-"]').click();
    await finish(page);
    await expect(page.getByTestId("assistant-entry")).toHaveCount(1);
    await expect(page.getByTestId("mutations")).toHaveCount(0);
  });
});

test.describe("AI-generated code review (practice)", () => {
  const FIXED = `def search_products(conn, term, limit=20):
    """Products whose name contains \`term\`, each with its category name."""
    rows = conn.execute("SELECT id, name, category_id FROM products WHERE name LIKE ? LIMIT ?", (f"%{term}%", limit)).fetchall()
    ids = sorted({row[2] for row in rows})
    marks = ",".join("?" * len(ids))
    names = dict(conn.execute(f"SELECT id, name FROM categories WHERE id IN ({marks})", ids).fetchall())
    return [{"id": pid, "name": name, "category": names.get(cid)} for pid, name, cid in rows]


def count_matches(conn, term):
    """How many products match \`term\`."""
    row = conn.execute("SELECT COUNT(*) FROM products WHERE name LIKE ?", (f"%{term}%",)).fetchone()
    return row[0] if row else 0
`;

  test("read the diff in both layouts, comment on a line, decide, fix it and check the fix, then see what was seeded", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    const rec = recordResponses(page);
    const planted = plantedOf("review", REVIEW);
    const injection = planted.find((p) => p.id === "sql-injection")!;

    await page.goto(item("review", REVIEW));
    await expect(page.getByTestId("pr-description")).toContainText("Search uses parameterized queries");
    await expect(page.getByTestId("diff-search.py")).toContainText("fetchone_or_none");
    await page.getByTestId("diff-split").click();
    await expect(page.getByTestId("diff-split")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("diff-unified").click();

    // A comment on the line with the f-string query.
    await page.getByTestId("diff-search.py").getByTestId(`line-${injection.lines[0]}`).first().click();
    await page.getByTestId("finding-category").selectOption(injection.category);
    await page.getByTestId("finding-severity").selectOption(injection.severity);
    await page.getByTestId("finding-text").fill("User input goes straight into the SQL string.");
    await page.getByTestId("save-finding").click();
    await expect(page.getByTestId("inline-comment")).toContainText("User input goes straight into the SQL string.");

    // The decision is recorded.
    await page.getByTestId("decision-request_changes").check();
    await page.getByLabel("Summary comment").fill("Needs parameterized queries and a real method name.");
    await page.getByTestId("submit-review").click();
    await expect(page.getByTestId("review-saved")).toBeVisible();

    // "Fix it": edit the file and check the fix against the hidden tests.
    await page.getByTestId("fix-it").click();
    await setWorkspaceFile(page, "search.py", FIXED);
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("verdict")).toHaveText("All tests passed", { timeout: 150_000 });
    await expect(page.getByTestId("test-list")).toContainText("Hidden test #1");

    expectNoLeak(rec.bodies, fluencyHidden("review", REVIEW));

    await finish(page);
    await expect(page.getByTestId("correct-decision")).toContainText("request changes");
    await expect(page.getByTestId(`planted-${injection.id}`)).toHaveAttribute("data-status", "found");
    await expect(page.getByTestId("planted-n-plus-one")).toHaveAttribute("data-status", "missed");
    await expect(page.getByTestId("dim-decision")).toContainText("auto");
    await expect(page.getByTestId("dim-fix")).toContainText("auto");
  });

  test("a correct PR: approve with nits is the right call", async ({ page }) => {
    await setProvider(page, "none");
    await page.goto(item("review", "pr-discount-calc"));
    await page.getByTestId("decision-approve").check();
    await page.getByLabel("Summary comment").fill("Looks right; remove the unused import.");
    await page.getByTestId("submit-review").click();
    await expect(page.getByTestId("review-saved")).toBeVisible();
    await finish(page);
    await expect(page.getByTestId("correct-decision")).toContainText("approve");
    await expect(page.getByTestId("correct-decision")).toContainText("a correct change");
  });
});

test.describe("feature extension (practice)", () => {
  test("the ticket, the existing tests, hidden acceptance tests that stay hidden, and the reference in the debrief", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    const rec = recordResponses(page);
    await page.goto(item("extension", EXT));
    await expect(page.getByTestId("ticket")).toContainText("tag todos and filter by tag");
    await expect(page.getByTestId("file-tree")).toContainText("CONVENTIONS.md");
    await expect(page.getByTestId("file-tree")).toContainText("src/todoapp/service.py");

    await page.getByTestId("cmd-tests").click();
    await expect(page.getByTestId("verdict")).toContainText(/^\d+\/\d+ passed$/, { timeout: 120_000 });
    const [a, b] = (await page.getByTestId("verdict").textContent())!.split(" ")[0]!.split("/");
    expect(a).toBe(b);

    // Untouched: the acceptance tests fail, but only as numbered hidden tests.
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("verdict")).not.toHaveText("All tests passed", { timeout: 150_000 });
    const untouched = /^acceptance: (\d+)\/(\d+)$/.exec((await page.getByTestId("count-acceptance").textContent())!.trim())!;
    expect(Number(untouched[1])).toBeLessThan(Number(untouched[2]));
    await expect(page.getByTestId("test-list")).toContainText("Hidden test #1");

    // Writing the feature: a new test file is allowed, and the reference passes everything.
    page.once("dialog", (d) => void d.accept("tests/test_mine.py"));
    await page.getByTestId("new-file").click();
    await expect(page.getByTestId("tree-tests/test_mine.py")).toBeVisible();
    for (const [file, code] of Object.entries(fluencyReference(EXT)).filter(([f]) => f.startsWith("src/"))) await setWorkspaceFile(page, file, code);
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("verdict")).toHaveText("All tests passed", { timeout: 150_000 });
    await expect(page.getByTestId("count-acceptance")).toContainText(/acceptance: (\d+)\/\1$/);

    expectNoLeak(rec.bodies, [...fluencyHidden("extension", EXT), "def clean_tags"]);

    await finish(page);
    await expect(page.getByTestId("extension-review")).toContainText("src/todoapp/validation.py");
    await expect(page.getByTestId("extension-review")).toContainText("tests/test_mine.py");
    await expect(page.getByTestId("extension-review")).toContainText("def clean_tags");
    await expect(page.getByTestId("dim-acceptance")).toContainText("auto");
    await expect(page.getByTestId("dim-regression")).toContainText("auto");
  });
});

test.describe("interviews", () => {
  test("scripted comprehension: phases, chat, the authored design questions, and a scored debrief", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    const rec = recordResponses(page);
    const first = plantedOf("comprehension", COMP)[0]!;
    const id = await startFluencyInterview(page, "comprehension", COMP, "Scripted interviewer");

    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Orientation");
    await expect(page.getByTestId("chat-log")).toContainText("60-minute code comprehension session");
    await expect(page.getByTestId("interview-timer")).toContainText(/^(59|60):/);
    await page.getByTestId("next-phase").click();
    await expect(page.getByTestId("chat-log")).toContainText("Now look for bugs");

    await addFinding(page, first.file, first.lines, first.category, first.severity, "the final row is lost");
    await page.getByTestId("chat-input").fill("I found a bug in the reader.");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("How is the search going");

    await page.getByTestId("next-phase").click();
    await expect(page.getByTestId("chat-log")).toContainText("Walk me through what happens to a row");
    expectNoLeak(rec.bodies, fluencyHidden("comprehension", COMP));

    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(new RegExp(`/debrief/${id}$`));
    await expect(page.getByTestId(`planted-${first.id}`)).toHaveAttribute("data-status", "found");
    await expect(page.getByTestId("dim-bug_recall")).toContainText("auto");
    await expect(page.getByTestId("replay")).toBeVisible();

    const grading = page.getByTestId("packet-fluency-grading");
    await grading.getByTestId("copy-packet").click();
    await grading.getByText("Show the prompt").click();
    const text = await grading.locator("textarea[readonly]").inputValue();
    expect(text).toContain("Dimension ids: summary, bug_recall, precision, severity, design, ai_use, communication");
    expect(text).toContain("the final row is lost");
    expect(text).toContain(`matches planted ${first.id}`);
  });

  test("AI interviewer (fake provider) streams and keeps hidden bug details out of the chat", async ({ page }) => {
    await setProvider(page, "fake");
    const rec = recordResponses(page);
    const id = await startFluencyInterview(page, "comprehension", COMP, "AI interviewer");
    await page.getByTestId("chat-input").fill("Where should I start?");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("[fake interviewer]", { timeout: 15_000 });
    await page.getByTestId("chat-input").fill("LEAK_TEST");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("[fake interviewer]", { timeout: 15_000 });
    expectNoLeak(rec.bodies, fluencyHidden("comprehension", COMP));
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(new RegExp(`/debrief/${id}$`));
    await page.getByTestId("grade-ai").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("[fake]", { timeout: 30_000 });
  });

  test("an interview in another chat: a live packet without hidden details, a grading packet with the work", async ({ page }) => {
    await setProvider(page, "none");
    const id = await startFluencyInterview(page, "review", REVIEW, "In another chat");
    const panel = page.getByTestId("packet-fluency-live");
    await panel.getByTestId("copy-packet").click();
    await panel.getByText("Show the prompt").click();
    const live = await panel.locator("textarea[readonly]").inputValue();
    expect(live).toContain("Add product search and match count");
    expect(live).toContain("fetchone_or_none");
    for (const n of fluencyHidden("review", REVIEW)) expect(live, n).not.toContain(n);
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(/\/debrief\//);
    const grading = await page.request.post("/api/packets", { data: { kind: "fluency-grading", sessionId: id } });
    expect((await grading.json()).markdown).toContain("Dimension ids:");
  });

  test("an extension interview keeps the clock and ends with the acceptance results", async ({ page }) => {
    await setProvider(page, "none");
    const id = await startFluencyInterview(page, "extension", EXT, "Scripted interviewer");
    await expect(page.getByTestId("chat-log")).toContainText("feature extension");
    await expect(page.getByTestId("ticket")).toContainText("tag todos");
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(new RegExp(`/debrief/${id}$`));
    await expect(page.getByTestId("extension-review")).toBeVisible();
    await expect(page.getByTestId("metrics")).toContainText("No submission");
  });
});
