import { expect, test, type Page } from "@playwright/test";
import {
  lldHiddenTestNames,
  lldReference,
  lldSlugs,
  lldSubmit,
  recordResponses,
  resetData,
  lldProvidedFile,
  setFile,
  setProvider,
} from "./helpers";

/**
 * M5: Low-Level Design. Practice (visible and hidden tests, categories, edit tracking, the requirement
 * change, hints, design review) and interviews (scripted and AI), with the real judge.
 */

const SLUG = "lru-cache";
const PY = lldReference(SLUG, "python");
const CPP = lldReference(SLUG, "cpp");

test.beforeAll(async ({ request }) => {
  await resetData(request);
});

async function open(page: Page, slug = SLUG) {
  await page.goto(`/lld/${slug}`);
  await expect(page.getByTestId("file-tabs")).toBeVisible();
}

/** An LRU cache written with OrderedDict: correct, but without the requirement change. */
const NO_TTL = `from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity):
        if capacity < 1:
            raise ValueError("capacity")
        self._cap = capacity
        self._d = OrderedDict()

    def get(self, key):
        if key not in self._d:
            return None
        self._d.move_to_end(key, last=False)
        return self._d[key]

    def put(self, key, value):
        if key in self._d:
            self._d.move_to_end(key, last=False)
        elif len(self._d) >= self._cap:
            self._d.popitem(last=True)
        self._d[key] = value
        self._d.move_to_end(key, last=False)

    def size(self):
        return len(self._d)

    def keys(self):
        return list(self._d.keys())
`;

test.describe("problem list", () => {
  test("lists the problems with format, difficulty, and languages, and filters", async ({ page }) => {
    await page.goto("/lld");
    const list = page.getByTestId("lld-list");
    for (const slug of lldSlugs()) await expect(list.locator(`a[href="/lld/${slug}"]`)).toBeVisible();
    await expect(list).toContainText("LRU Cache");
    await page.getByRole("link", { name: "Complete the system" }).first().click();
    await expect(page).toHaveURL(/format=system/);
    await expect(list.locator('a[href="/lld/lru-cache"]')).toHaveCount(0);
  });
});

test.describe("practice", () => {
  test("a failing submission shows categories and masks hidden tests; a correct one passes in Python and C++", async ({ page }) => {
    await setProvider(page, "none");
    const rec = recordResponses(page);
    await open(page);
    await expect(page.getByTestId("file-lru_cache.py")).toContainText("yours");

    // The starter raises NotImplementedError: visible tests fail with their messages.
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("verdict")).toContainText("passed");
    await expect(page.getByTestId("test-list")).toContainText("test_core_get_returns_what_was_put");
    await expect(page.getByTestId("test-list")).toContainText("NotImplementedError");

    // Submit with a stub: hidden failures show only their number and category.
    await lldSubmit(page);
    await expect(page.getByTestId("count-core")).toBeVisible();
    await expect(page.getByTestId("test-list")).toContainText("Hidden test #1");
    const hiddenNames = lldHiddenTestNames(SLUG);
    expect(hiddenNames.length).toBeGreaterThan(10);

    // A correct solution (without the requirement change) passes core and edge.
    await setFile(page, "lru_cache.py", NO_TTL);
    await lldSubmit(page);
    await expect(page.getByTestId("verdict")).toHaveText("All tests passed");
    await expect(page.getByTestId("count-core")).toContainText("Core: ");
    await expect(page.getByTestId("count-edge")).toContainText("Edge cases: ");
    await expect(page.getByTestId("count-extension")).toHaveCount(0);
    await expect(page.getByTestId("solved-badge")).toBeVisible({ timeout: 5000 }).catch(() => undefined);

    // C++ works the same way, with a header-only reference.
    await page.getByLabel("Language").selectOption("cpp");
    await setFile(page, "lru_cache.hpp", CPP["lru_cache.hpp"]!);
    await lldSubmit(page);
    await expect(page.getByTestId("verdict")).toHaveText("All tests passed");

    // A C++ build error shows the compiler output, and nothing from hidden test sources.
    await setFile(page, "lru_cache.hpp", "#pragma once\nthis is not c++\n");
    await lldSubmit(page);
    await expect(page.getByTestId("verdict")).toHaveText("Build error");

    const bodies = rec.bodies.join("\n");
    for (const name of hiddenNames) expect(bodies, `hidden test ${name} leaked`).not.toContain(name);
  });

  test("the requirement change adds extension tests: code without it fails them, the reference passes", async ({ page }) => {
    await setProvider(page, "none");
    await open(page);
    await setFile(page, "lru_cache.py", NO_TTL);
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("show-change").click();
    await expect(page.getByTestId("change-text")).toContainText("time-to-live");
    await expect(page.getByRole("tab", { name: "new requirement" })).toBeVisible();

    await lldSubmit(page);
    await expect(page.getByTestId("verdict")).toHaveText("Core and edge tests passed");
    await expect(page.getByTestId("count-extension")).toContainText("Extension: 0/4");

    await setFile(page, "lru_cache.py", PY["lru_cache.py"]!);
    await lldSubmit(page);
    await expect(page.getByTestId("verdict")).toHaveText("All tests passed");
    await expect(page.getByTestId("count-extension")).toContainText("Extension: 4/4");
  });

  test("a 'complete the system' problem: provided file is editable, its edits are tracked and flagged", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    await open(page, "parking-lot");
    await expect(page.getByTestId("file-models.py")).toContainText("provided");
    await expect(page.getByTestId("file-parking_lot.py")).toContainText("yours");
    await expect(page.getByRole("tab", { name: /test_visible\.py/ })).toContainText("read-only");

    // The provided file opens read-write; edit it and the tab says so.
    const original = lldProvidedFile("parking-lot", "models.py");
    await setFile(page, "models.py", `${original}\n# my change\nEXTRA = 1\n`);
    await expect(page.getByTestId("file-models.py")).toContainText("edited");

    await setFile(page, "parking_lot.py", lldReference("parking-lot", "python")["parking_lot.py"]!);
    await lldSubmit(page);
    await expect(page.getByTestId("verdict")).toHaveText("All tests passed");
    await expect(page.getByTestId("edit-flag")).toContainText("models.py");
    await expect(page.getByTestId("edit-flag")).toContainText("+3");

    // The visible test file can be read but not changed.
    await page.getByRole("tab", { name: /test_visible\.py/ }).click();
    await expect(page.locator(".monaco-editor").first()).toContainText("test_core_park_returns_a_ticket_with_a_spot", { timeout: 20_000 });
  });

  test("hints unlock one at a time, then the design notes, class diagram, and reference", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    await open(page);
    await page.getByRole("tab", { name: "hints" }).click();
    await expect(page.getByTestId("reveal-hint-2")).toBeDisabled();
    await expect(page.getByTestId("reveal-editorial")).toBeDisabled();
    for (const level of [1, 2, 3, 4]) await page.getByTestId(`reveal-hint-${level}`).click();
    await expect(page.getByTestId("hint-4")).toContainText("OrderedDict");
    await page.getByTestId("reveal-editorial").click();
    const design = page.getByTestId("design-view");
    await expect(design).toContainText("Design notes");
    await expect(design.getByTestId("mermaid")).toBeVisible({ timeout: 30_000 });
    await expect(design).toContainText("class LRUCache");
    await design.getByRole("tab", { name: "C++20" }).click();
    await expect(design).toContainText("std::unordered_map");
  });

  test("an approach check judges a design without writing one", async ({ page }) => {
    await setProvider(page, "fake");
    await open(page);
    await page.getByRole("tab", { name: "approach" }).click();
    await page.getByLabel("Your approach").fill("A hash map from key to node plus a doubly linked list ordered by recency.");
    await page.getByTestId("check-approach").click();
    await expect(page.getByTestId("approach-reply")).toContainText(/^Works/);
    await setProvider(page, "none");
  });
});

async function startLldInterview(page: Page, slug: string, interviewer: "AI interviewer" | "Scripted interviewer" | "In another chat"): Promise<string> {
  await page.goto(`/lld/${slug}`);
  await page.getByTestId("open-interview").click();
  await page.getByRole("dialog", { name: "Start a mock interview" }).getByLabel(interviewer).check();
  await page.getByTestId("start-interview").click();
  await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
  return page.url().split("/").pop()!;
}

test.describe("interview", () => {
  test("scripted: phases, the requirement change at the right phase, tests, debrief with the reference and a grading packet; nothing hidden leaks", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    const rec = recordResponses(page);
    const id = await startLldInterview(page, SLUG, "Scripted interviewer");

    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Introductions");
    await expect(page.getByTestId("chat-log")).toContainText("45-minute low-level design interview");
    await expect(page.getByTestId("interview-timer")).toContainText(/^(44|45):/);
    await expect(page.getByRole("tab", { name: "new requirement" })).toHaveCount(0);

    await page.getByTestId("next-phase").click();
    await expect(page.getByTestId("chat-log")).toContainText("main classes or modules");
    await page.getByTestId("chat-input").fill("A hash map to nodes plus a doubly linked list for recency.");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("most likely to change");
    await page.getByTestId("next-phase").click();
    await setFile(page, "lru_cache.py", NO_TTL);
    await lldSubmit(page);
    await expect(page.getByTestId("verdict")).toHaveText("All tests passed");
    await expect(page.getByTestId("count-extension")).toHaveCount(0);

    // The hint ladder works but costs; the reference does not.
    await page.getByRole("tab", { name: "hints" }).click();
    await expect(page.getByTestId("hint-penalty")).toBeVisible();
    await expect(page.getByTestId("reveal-editorial")).toHaveCount(0);

    // Moving on to the new requirement posts it word for word and opens the extension tests.
    await page.getByTestId("next-phase").click();
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("New requirement");
    await expect(page.getByTestId("chat-log")).toContainText("New requirement: Entries can now expire");
    await expect(page.getByRole("tab", { name: "new requirement" })).toBeVisible({ timeout: 10_000 });
    await setFile(page, "lru_cache.py", PY["lru_cache.py"]!);
    await lldSubmit(page);
    await expect(page.getByTestId("count-extension")).toContainText("Extension: 4/4");

    const live = rec.bodies.join("\n");
    for (const needle of ["self._tail.prev", "Sentinel head and tail", "OrderedDict does the pairing"]) expect(live, needle).not.toContain(needle);
    for (const name of lldHiddenTestNames(SLUG)) expect(live, name).not.toContain(name);

    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(new RegExp(`/debrief/${id}$`));

    await expect(page.getByTestId("dim-correctness")).toContainText("auto");
    await expect(page.getByTestId("metrics")).toContainText("core and edge tests");
    await expect(page.getByTestId("metrics")).toContainText("Extension tests (new requirement): 4/4");
    await expect(page.getByTestId("lld-reveal")).toContainText("Sentinel head and tail");
    await expect(page.getByTestId("lld-reveal").getByTestId("mermaid")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("self-checklist")).toContainText("Split the problem into classes with one clear job each");
    await expect(page.getByTestId("replay")).toContainText("New requirement introduced");

    const grading = page.getByTestId("packet-lld-grading");
    await grading.getByTestId("copy-packet").click();
    await grading.getByText("Show the prompt").click();
    const text = await grading.locator("textarea[readonly]").inputValue();
    expect(text).toContain("Dimension ids: correctness, separation, patterns, naming, errors_extensibility, complexity, conventions, communication");
    expect(text).toContain("Entries can now expire");
    expect(text).toContain("Sentinel head and tail");
    expect(text).toContain("_purge_expired");
    const dims = ["correctness", "separation", "patterns", "naming", "errors_extensibility", "complexity", "conventions", "communication"];
    const reply = { dimensions: dims.map((d) => ({ id: d, score: 3, evidence: ["[10:00] fine"] })), recommendation: "lean_hire", strengths: ["a", "b", "c"], improvements: ["a", "b", "c"], strong_candidate: "x" };
    await grading.getByLabel("Paste the reply").fill("Good.\n```json\n" + JSON.stringify(reply) + "\n```");
    await grading.getByTestId("save-reply").click();
    await expect(page.getByTestId("ai-feedback")).toBeVisible();
    await expect(page.getByTestId("recommendation")).toContainText("Lean Hire");

    await page.getByTestId("redo").click();
    await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
    expect(page.url()).not.toContain(id);
  });

  test("AI interviewer (fake provider): streams, blocks a leak of the reference, and grades with AI", async ({ page }) => {
    await setProvider(page, "fake");
    const rec = recordResponses(page);
    const id = await startLldInterview(page, SLUG, "AI interviewer");
    await page.getByTestId("chat-input").fill("I'd use a hash map and a doubly linked list.");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("[fake interviewer]", { timeout: 15_000 });
    await page.getByTestId("chat-input").fill("LEAK_TEST");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("I can't give that part away", { timeout: 15_000 });
    expect(rec.bodies.join("\n")).not.toContain("self._tail.prev");
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(new RegExp(`/debrief/${id}$`));
    await page.getByTestId("grade-ai").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("[fake]", { timeout: 30_000 });
    await setProvider(page, "none");
  });

  test("an interview in another chat: live packet with the starting code, pasted transcript in the grading packet", async ({ page }) => {
    await setProvider(page, "none");
    const id = await startLldInterview(page, SLUG, "In another chat");
    const panel = page.getByTestId("packet-lld-interview-live");
    await panel.getByTestId("copy-packet").click();
    await panel.getByText("Show the prompt").click();
    const live = await panel.locator("textarea[readonly]").inputValue();
    expect(live).toContain("LRU Cache");
    expect(live).toContain("class LRUCache");
    expect(live).not.toContain("Sentinel head and tail");
    expect(live).not.toContain("self._tail.prev");
    await panel.getByLabel("Paste the conversation (optional, for grading)").fill("Interviewer: Hi!\nMe: Hash map plus linked list.");
    await panel.getByTestId("save-reply").click();
    await expect(panel).toContainText("Reply saved");
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("end-interview").click();
    await page.waitForURL(/\/debrief\//);
    const grading = await page.request.post("/api/packets", { data: { kind: "lld-grading", sessionId: id } });
    expect((await grading.json()).markdown).toContain("Hash map plus linked list.");
  });
});
