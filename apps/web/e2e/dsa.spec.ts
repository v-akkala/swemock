import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { CONTENT, allProblems, hintsOf, recordResponses, resetData, reference, selectLanguage, setCode, slugForTitle, submit, titleOf, verdict, waitForEditor } from "./helpers";

const NEEDS_FRESH_DB_NOTE = "uses the real judge";

test.beforeAll(async ({ request }) => {
  await resetData(request);
});

test.describe("problem browser", () => {
  test("lists every problem and filters by difficulty, topic and search", async ({ page }) => {
    const problems = allProblems();
    const rows = page.getByTestId("problem-list").locator("li");

    await page.goto("/dsa");
    await expect(rows).toHaveCount(problems.length);

    await page.goto("/dsa?difficulty=hard");
    await expect(rows).toHaveCount(problems.filter((p) => p.difficulty === "hard").length);

    const tag = problems.find((p) => p.tags.includes("trees"))!.tags.find((t) => t === "trees")!;
    const withTag = problems.filter((p) => p.tags.includes(tag));
    await page.goto(`/dsa?tag=${tag}`);
    await expect(rows).toHaveCount(withTag.length);
    await expect(rows.first()).toContainText(withTag[0]!.title);

    const word = problems[0]!.title.split(" ")[0]!;
    const matching = problems.filter((p) => p.title.toLowerCase().includes(word.toLowerCase()) || p.tags.some((t) => t.includes(word.toLowerCase())));
    await page.goto(`/dsa?q=${word}`);
    await expect(rows).toHaveCount(matching.length);
  });

  test("the random picker respects the filters", async ({ page }) => {
    const matches = allProblems().filter((p) => p.difficulty === "hard" && p.tags.includes("stack"));
    expect(matches.length).toBeGreaterThan(0);
    await page.goto("/dsa?difficulty=hard&tag=stack");
    await page.getByTestId("random-problem").click();
    await expect(page).toHaveURL(new RegExp(`/dsa/(${matches.map((m) => m.slug).join("|")})$`));
  });

  test("Ctrl+K opens the command palette", async ({ page }) => {
    await page.goto("/dsa");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    // The key handler exists only after hydration, which can lag on a cold production server: retry.
    await expect(async () => {
      if (!(await dialog.isVisible())) await page.keyboard.press("Control+k");
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await dialog.getByRole("textbox").fill("brackets");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dsa\/balanced-brackets$/);
  });
});

test.describe("solving a problem", () => {
  test(`Run, Submit, verdicts and efficiency in Python and C++ (${NEEDS_FRESH_DB_NOTE})`, async ({ page }) => {
    await page.goto("/dsa/balanced-brackets");
    await expect(page.getByRole("heading", { name: "Balanced Brackets" })).toBeVisible();

    // The statement renders math from bundled KaTeX.
    await expect(page.locator(".katex").first()).toBeVisible();

    // The editor starts with the generated stub.
    await waitForEditor(page);
    await expect(page.locator(".monaco-editor").first()).toContainText("class Solution");

    // A wrong answer is reported with the failing sample's input, expected and actual output.
    await setCode(page, "class Solution:\n    def isBalanced(self, s: str) -> bool:\n        return True\n");
    await page.getByTestId("run-button").click();
    expect(await verdict(page)).toBe("Wrong Answer");
    await expect(page.getByTestId("verdict-panel")).toContainText("Expected");

    // Correct code passes the samples (Run), then all tests (Submit).
    await setCode(page, reference("balanced-brackets", "python"));
    await page.getByTestId("run-button").click();
    await expect.poll(async () => (await page.getByTestId("verdict").textContent())?.trim()).toBe("Samples passed");
    await submit(page);
    await expect.poll(async () => (await page.getByTestId("verdict").textContent())?.trim(), { timeout: 120_000 }).toBe("Accepted");
    await expect(page.getByTestId("efficiency")).toBeVisible();
    await expect(page.getByTestId("solved-badge").or(page.getByText("✓ Solved"))).toBeVisible();

    // A syntax error is a compile error with the compiler's message.
    await selectLanguage(page, "C++20");
    await expect(page.locator(".monaco-editor").first()).toContainText("class Solution");
    await setCode(page, "class Solution { public: bool isBalanced(string s) { return ; } };");
    await page.getByTestId("run-button").click();
    expect(await verdict(page)).toBe("Compile Error");

    // C++ submit. Drafts are per language: Python keeps its code.
    await setCode(page, reference("balanced-brackets", "cpp"));
    await submit(page);
    await expect.poll(async () => (await page.getByTestId("verdict").textContent())?.trim(), { timeout: 120_000 }).toBe("Accepted");
    await selectLanguage(page, "Python 3.12");
    await expect(page.locator(".monaco-editor").first()).toContainText("partner");

    // The browser shows the problem as solved.
    await page.goto("/dsa?status=solved");
    await expect(page.getByTestId("problem-list")).toContainText("Balanced Brackets");
  });

  test("custom input is run alongside the samples", async ({ page }) => {
    await page.goto("/dsa/fewest-coins");
    await setCode(page, reference("fewest-coins", "python"));
    await page.getByLabel("Custom input").fill('{"coins": [3, 7], "amount": 17}');
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("verdict-panel")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("tab", { name: /Custom input/ }).click();
    await expect(page.getByTestId("verdict-panel")).toContainText("3");

    await page.getByRole("tab", { name: "testcase" }).click();
    await page.getByLabel("Custom input").fill('{"coins": "nope"}');
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("error")).toContainText("Custom input");
  });

  test("code is autosaved per language and restored after a reload", async ({ page }) => {
    await page.goto("/dsa/merge-ranges");
    await setCode(page, "# my python draft\nclass Solution:\n    pass\n");
    await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 15_000 });
    await selectLanguage(page, "C++20");
    await setCode(page, "// my c++ draft\nclass Solution {};\n");
    await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 15_000 });

    await page.reload();
    await waitForEditor(page);
    await expect(page.locator(".monaco-editor").first()).toContainText("my python draft");
    await selectLanguage(page, "C++20");
    await expect(page.locator(".monaco-editor").first()).toContainText("my c++ draft");
  });
});

test.describe("hidden tests, hints and the editorial", () => {
  test("a hidden failure shows only its number and category, and nothing private leaks", async ({ page }) => {
    const slug = "count-pairs-with-sum";
    const dir = path.join(CONTENT, slug);
    const hidden = JSON.parse(fs.readFileSync(path.join(dir, "tests/hidden.json"), "utf8")) as { input: unknown; expected: unknown }[];
    const hiddenSnippets = hidden.map((h) => JSON.stringify(h.input)).filter((s) => s.length > 200).map((s) => s.slice(0, 120));
    expect(hiddenSnippets.length).toBeGreaterThan(0);
    const hintSnippets = hintsOf(slug).map((h) => h.slice(0, 60));
    expect(hintSnippets).toHaveLength(4);
    const editorialSnippet = fs.readFileSync(path.join(dir, "editorial.md"), "utf8").split("\n").find((l) => l.length > 60)!.slice(0, 60);
    const referenceSnippet = "seen.get(target - x, 0)";

    const rec = recordResponses(page);
    await page.goto(`/dsa/${slug}`);

    // Passes the samples and small tests, but is quadratic: fails a hidden stress test.
    await setCode(page, fs.readFileSync(path.join(dir, "solutions/brute.py"), "utf8"));
    await submit(page);
    expect(await verdict(page)).toBe("Time Limit Exceeded");
    await expect(page.getByTestId("hidden-failure")).toContainText(/Hidden test #\d+/);
    await expect(page.getByTestId("hidden-failure")).toContainText("stress");
    await expect(page.getByTestId("hidden-failure")).not.toContainText("nums");

    await page.getByRole("tab", { name: "hints" }).click();
    await expect(page.getByTestId("reveal-hint-2")).toBeDisabled();
    await expect(page.getByTestId("reveal-editorial")).toBeDisabled();

    const everything = rec.bodies.join("\n");
    expect(rec.bodies.length).toBeGreaterThan(3);
    // Positive control: public content (a sample input) does appear, so the scan can find things.
    expect(everything).toContain("[1,5,7,-1,5]");
    for (const s of hiddenSnippets) expect(everything, "hidden test input leaked").not.toContain(s);
    for (const s of hintSnippets) expect(everything, "hint leaked before being revealed").not.toContain(s);
    expect(everything, "editorial leaked").not.toContain(editorialSnippet);
    expect(everything, "reference solution leaked").not.toContain(referenceSnippet);
  });

  test("hints unlock one at a time, then the editorial with reference solutions", async ({ page }) => {
    await page.goto("/dsa/merge-sorted-lists");
    await page.getByRole("tab", { name: "hints" }).click();
    await expect(page.getByTestId("reveal-hint-1")).toBeEnabled();
    await expect(page.getByTestId("reveal-hint-3")).toBeDisabled();
    await expect(page.getByTestId("reveal-editorial")).toBeDisabled();

    for (const level of [1, 2, 3, 4]) {
      await page.getByTestId(`reveal-hint-${level}`).click();
      await expect(page.getByTestId(`hint-${level}`)).not.toContainText("Reveal hint");
    }
    await expect(page.getByTestId("reveal-editorial")).toBeEnabled();
    await page.getByTestId("reveal-editorial").click();
    await expect(page.getByTestId("editorial")).toContainText("Intuition");
    await expect(page.getByTestId("editorial")).toContainText("dummy");
    await page.getByRole("tab", { name: "C++20" }).click();
    await expect(page.getByTestId("editorial")).toContainText("ListNode* mergeTwoSorted");

    // Revealed hints survive a reload (they belong to the active session).
    await page.reload();
    await page.getByRole("tab", { name: "hints" }).click();
    await expect(page.getByTestId("hint-4")).not.toContainText("Reveal hint");
    await expect(page.getByRole("tab", { name: "editorial" })).toBeVisible();
  });

  test("giving up reveals the editorial immediately", async ({ page }) => {
    await page.goto("/dsa/deepest-level-sum");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("tab", { name: "hints" }).click();
    await page.getByTestId("give-up").click();
    await expect(page.getByTestId("editorial")).toContainText("Intuition");
  });
});

test.describe("online assessment", () => {
  test("two problems, one clock, partial credit, and results", async ({ page }) => {
    await page.goto("/dsa/oa");
    await page.getByTestId("start-oa").click();
    await expect(page).toHaveURL(/\/dsa\/oa\/[A-Z0-9]+$/);
    await expect(page.getByTestId("oa-timer")).toContainText(/1:09:\d\d|1:10:00/);

    const tabs = page.getByRole("tablist", { name: "Problems" }).getByRole("tab");
    await expect(tabs).toHaveCount(2);
    const firstTitle = (await tabs.first().textContent())!.replace(/^\d+\.\s*/, "").trim();
    const slug = slugForTitle(firstTitle);
    expect(titleOf(slug)).toBe(firstTitle);

    // There is no hints tab in an assessment.
    await expect(page.getByRole("tab", { name: "hints" })).toHaveCount(0);

    // Solve the first problem fully; leave the second empty.
    await setCode(page, reference(slug, "python"));
    await submit(page);
    await expect.poll(async () => (await page.getByTestId("verdict").first().textContent())?.trim(), { timeout: 120_000 }).toBe("Accepted");

    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("finish-oa").click();
    await expect(page.getByTestId("oa-results")).toBeVisible();
    await expect(page.getByTestId("oa-score")).toHaveText("50%");
    await expect(page.getByTestId("oa-results")).toContainText(firstTitle);
  });
});

test.describe("content review", () => {
  test("lists unreviewed items and approves them", async ({ page }) => {
    await page.goto("/content-review");
    const rows = page.getByTestId("unreviewed-list").locator("li");
    const before = await rows.count().catch(() => 0);
    test.skip(before === 0, "everything is already reviewed");
    await rows.first().getByRole("button", { name: "Approve" }).click();
    await expect.poll(async () => page.getByTestId("unreviewed-list").locator("li").count().catch(() => 0)).toBe(before - 1);
  });
});
