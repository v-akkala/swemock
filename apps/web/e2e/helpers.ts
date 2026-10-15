import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const CONTENT = path.resolve(import.meta.dirname, "../../../content/dsa");

export function reference(slug: string, language: "python" | "cpp"): string {
  return fs.readFileSync(path.join(CONTENT, slug, "solutions", language === "python" ? "reference.py" : "reference.cpp"), "utf8");
}

export interface ProblemInfo {
  slug: string;
  title: string;
  difficulty: string;
  tags: string[];
}

/** Every problem on disk, read from problem.yaml (inline `tags: [a, b]` lists, as in the scaffold). */
export function allProblems(): ProblemInfo[] {
  return fs
    .readdirSync(CONTENT)
    .filter((slug) => fs.existsSync(path.join(CONTENT, slug, "problem.yaml")))
    .map((slug) => {
      const yaml = fs.readFileSync(path.join(CONTENT, slug, "problem.yaml"), "utf8");
      const field = (name: string) => new RegExp(`^${name}:\\s*(.+?)\\s*(?:#.*)?$`, "m").exec(yaml)![1]!;
      return {
        slug,
        title: field("title"),
        difficulty: field("difficulty"),
        tags: field("tags").replace(/[[\]]/g, "").split(",").map((t) => t.trim()),
      };
    });
}

/** The four hint texts from problem.yaml (only the `hints:` block, not the follow-ups). */
export function hintsOf(slug: string): string[] {
  const yaml = fs.readFileSync(path.join(CONTENT, slug, "problem.yaml"), "utf8");
  const block = /^hints:\n((?: {2}- .*\n)+)/m.exec(yaml)?.[1] ?? "";
  return [...block.matchAll(/^ {2}- "(.*)"$/gm)].map((m) => m[1]!);
}

/** Wipes user data on the server (test mode only), so a spec doesn't depend on earlier runs. */
export async function resetData(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/test/reset", { data: {} });
  if (!res.ok()) throw new Error(`Reset failed (is the stack running with SWEMOCK_TEST_MODE=1?): ${await res.text()}`);
}

export function titleOf(slug: string): string {
  const yaml = fs.readFileSync(path.join(CONTENT, slug, "problem.yaml"), "utf8");
  return /^title:\s*(.+)$/m.exec(yaml)![1]!.trim();
}

export function slugForTitle(title: string): string {
  const slug = fs.readdirSync(CONTENT).find((s) => fs.existsSync(path.join(CONTENT, s, "problem.yaml")) && titleOf(s) === title);
  if (!slug) throw new Error(`No problem titled ${title}`);
  return slug;
}

/** Replaces the editor's content the way typing would (fires Monaco's change event). */
export async function setCode(page: Page, code: string): Promise<void> {
  await waitForEditor(page);
  await page.evaluate((value) => {
    (window as unknown as { __swemockSetCode: (v: string) => void }).__swemockSetCode(value);
  }, code);
}

export async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __swemockSetCode?: unknown }).__swemockSetCode));
}

export async function selectLanguage(page: Page, label: "Python 3.12" | "C++20"): Promise<void> {
  await page.getByLabel("Language").selectOption({ label });
  await expect(page.getByLabel("Language")).toHaveValue(label === "C++20" ? "cpp" : "python");
}

/** The visible Submit button (an assessment keeps both problems mounted). */
export async function submit(page: Page): Promise<void> {
  await page.locator('[data-testid="submit-button"]:visible').click();
}

/** Waits until the verdict panel shows a result for the latest action. */
export async function verdict(page: Page): Promise<string> {
  const el = page.locator('[data-testid="verdict"]:visible');
  await expect(el).toBeVisible({ timeout: 120_000 });
  return (await el.textContent())!.trim();
}

/** Collects the text of every HTTP response the page receives (to scan for leaked content). */
export function recordResponses(page: Page): { bodies: string[]; urls: string[] } {
  const rec = { bodies: [] as string[], urls: [] as string[] };
  page.on("response", async (res) => {
    try {
      const type = res.headers()["content-type"] ?? "";
      if (/json|html|text|javascript/.test(type) && res.status() < 400) {
        rec.bodies.push(await res.text());
        rec.urls.push(res.url());
      }
    } catch {
      /* body not available (redirect, aborted) */
    }
  });
  return rec;
}

/** Switches the AI provider through the settings API ("fake" needs SWEMOCK_TEST_MODE=1 on the server). */
export async function setProvider(page: Page, provider: "none" | "fake"): Promise<void> {
  const res = await page.request.patch("/api/settings", { data: { provider, onboardingDone: true } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Starts a mock interview from a problem page and returns its id. */
export async function startInterview(page: Page, slug: string, interviewer: "AI interviewer" | "Scripted interviewer" | "In another chat"): Promise<string> {
  await page.goto(`/dsa/${slug}`);
  await page.getByTestId("open-interview").click();
  await page.getByRole("dialog", { name: "Start a mock interview" }).getByLabel(interviewer).check();
  await page.getByTestId("start-interview").click();
  await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
  return page.url().split("/").pop()!;
}

/** A complete, valid grading reply for the DSA rubric, as a chatbot would paste it. */
export function gradingReply(score = 3): string {
  const ids = ["understanding", "algorithm", "correctness", "code_quality", "complexity", "testing", "communication"];
  const grade = {
    dimensions: ids.map((id) => ({ id, score, evidence: [`[02:00] evidence for ${id}`] })),
    recommendation: "lean_hire",
    strengths: ["Clear plan", "Tested edges", "Readable code"],
    improvements: ["State complexity sooner", "Ask about input size", "Narrate more while coding"],
    strong_candidate: "Would have confirmed constraints first and stated the complexity before coding.",
  };
  return `Overall a solid round.\n\n\`\`\`json\n${JSON.stringify(grade, null, 2)}\n\`\`\`\n`;
}

// ---- conversation rounds (M4) -----------------------------------------------------------------------

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../content");

/** The value of a top-level `key:` in a question.yaml: a block scalar (`|`), a `- item` list, or an inline value. */
function yamlSection(yaml: string, key: string): string[] {
  const lines = yaml.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at < 0) return [];
  const head = lines[at]!.slice(key.length + 1).trim();
  const body: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (/^\S/.test(l)) break;
    body.push(l);
  }
  if (head === "|") return [body.map((l) => l.replace(/^ {2}/, "")).join("\n").trim()];
  if (head === "") {
    const items: string[] = [];
    for (const l of body) {
      if (l.startsWith("  - ")) items.push(l.slice(4).trim());
      else if (items.length && l.trim()) items[items.length - 1] += ` ${l.trim()}`;
    }
    return items.map((t) => t.replace(/^["']|["']$/g, ""));
  }
  return [head];
}

export interface QuestionInfo {
  slug: string;
  prompt: string;
  /** CS: key points. Behavioral: strong-answer signals. */
  hidden: string[];
  followUps: string[];
}

function readQuestions(type: "cs" | "behavioral"): QuestionInfo[] {
  const dir = path.join(CONTENT_ROOT, type);
  return fs
    .readdirSync(dir)
    .filter((slug) => fs.existsSync(path.join(dir, slug, "question.yaml")))
    .map((slug) => {
      const yaml = fs.readFileSync(path.join(dir, slug, "question.yaml"), "utf8");
      return {
        slug,
        prompt: yamlSection(yaml, "prompt")[0] ?? "",
        hidden: yamlSection(yaml, type === "cs" ? "key_points" : "strong_signals"),
        followUps: yamlSection(yaml, "follow_ups"),
      };
    });
}

export const csQuestions = () => readQuestions("cs");
export const behavioralQuestions = () => readQuestions("behavioral");

/** Sends a chat message and waits for the interviewer's next line (scripted driver). */
export async function say(page: Page, text: string): Promise<void> {
  const before = await page.locator('[data-from="interviewer"]').count();
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-input").press("Enter");
  await expect.poll(() => page.locator('[data-from="interviewer"]').count(), { timeout: 15_000 }).toBeGreaterThan(before);
}

export const RESUME = `Jordan Rivera
jordan@example.com | github.com/jrivera

EDUCATION
State University - B.S. Computer Science, 2022 - 2026

EXPERIENCE
Acme Cloud - Software Engineering Intern    Jun 2025 - Aug 2025
- Improved API latency by 40% by adding a Redis cache in front of the catalog service
- Worked on internal dashboards
- Led a team of 3 interns to build a scalable data pipeline that processes 2M events per day

PROJECTS
Tiny Search (2024)
- Built a full-text search engine in C++ with an inverted index and BM25 ranking

SKILLS
Languages: Python, C++, SQL
`;

/** A complete, valid grading reply for the recruiter or behavioral rubric. */
export function gradingReplyFor(dimensions: string[], score = 3): string {
  const grade = {
    dimensions: dimensions.map((id) => ({ id, score, evidence: [`[02:00] evidence for ${id}`] })),
    recommendation: "lean_hire",
    strengths: ["Clear answers", "Good specifics", "Owned the work"],
    improvements: ["Lead with the result", "Add numbers", "Be briefer"],
    strong_candidate: "Would have led with the outcome and quantified it.",
  };
  return `A solid round.\n\n\`\`\`json\n${JSON.stringify(grade, null, 2)}\n\`\`\`\n`;
}

export const RECRUITER_DIMENSIONS = ["communication", "resume_depth", "motivation", "fundamentals"];
export const BEHAVIORAL_DIMENSIONS = ["structure", "specificity", "ownership", "impact", "reflection", "relevance", "concision"];

export const STRONG_ANSWER =
  "At my last internship I led the migration of our billing service to separate services and I wrote the cutover plan myself. We shipped it in six weeks, and I cut incidents by 30 percent. Next time I would involve support earlier.";

// ---- low-level design (M5) ----------------------------------------------------------------------------

const LLD_ROOT = path.resolve(import.meta.dirname, "../../../content/lld");

export function lldSlugs(): string[] {
  return fs.readdirSync(LLD_ROOT).filter((s) => fs.existsSync(path.join(LLD_ROOT, s, "problem.yaml")));
}

/** The reference files of an LLD problem: path → text. */
export function lldReference(slug: string, lang: "python" | "cpp"): Record<string, string> {
  const dir = path.join(LLD_ROOT, slug, lang, "reference");
  return Object.fromEntries(fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
}

/** Names of the hidden and extension tests (they must never reach the browser before the debrief). */
export function lldHiddenTestNames(slug: string): string[] {
  const out: string[] = [];
  for (const lang of ["python", "cpp"] as const) {
    for (const dir of ["hidden", "extension"]) {
      const d = path.join(LLD_ROOT, slug, lang, "tests", dir);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        const text = fs.readFileSync(path.join(d, f), "utf8");
        out.push(...[...text.matchAll(/def (test_\w+)|TEST_CASE\("([^"]+)"/g)].map((m) => (m[1] ?? m[2])!));
      }
    }
  }
  return out;
}

/** Opens a file tab and replaces its content. */
export async function setFile(page: Page, file: string, code: string): Promise<void> {
  await page.getByTestId(`file-${file}`).click();
  // The editor is remounted per file; wait until the new one is the one the test hook talks to.
  await page.waitForFunction((f) => (window as unknown as { __swemockEditorLabel?: string }).__swemockEditorLabel?.endsWith(`:${f}`), file);
  await setCode(page, code);
}

export async function lldSubmit(page: Page): Promise<void> {
  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 150_000 });
}

/** A provided (starter) file of an LLD problem, as shipped. */
export function lldProvidedFile(slug: string, file: string, lang: "python" | "cpp" = "python"): string {
  return fs.readFileSync(path.join(LLD_ROOT, slug, lang, "starter", file), "utf8");
}

// ---- AI Fluency (M6) -----------------------------------------------------------------------------------

const FLUENCY_ROOT = path.resolve(import.meta.dirname, "../../../content");
export type FluencyKind = "comprehension" | "review" | "extension";

export function fluencySlugs(type: FluencyKind): string[] {
  return fs.readdirSync(path.join(FLUENCY_ROOT, type)).filter((s) => fs.existsSync(path.join(FLUENCY_ROOT, type, s, "item.yaml")));
}

export interface PlantedInfo {
  id: string;
  file: string;
  lines: [number, number];
  category: string;
  severity: string;
}

/** Planted bugs (comprehension) or seeded issues (review), read from item.yaml. */
export function plantedOf(type: "comprehension" | "review", slug: string): PlantedInfo[] {
  const yaml = fs.readFileSync(path.join(FLUENCY_ROOT, type, slug, "item.yaml"), "utf8");
  return [...yaml.matchAll(/^\s*- id: ([\w-]+)\n\s+file: ([\w./-]+)\n\s+lines: \[(\d+), (\d+)\]\n\s+category: ([\w-]+)\n\s+severity: (\w+)/gm)].map((m) => ({
    id: m[1]!,
    file: m[2]!,
    lines: [Number(m[3]), Number(m[4])],
    category: m[5]!,
    severity: m[6]!,
  }));
}

/** Strings that must never reach the browser before the debrief: explanations and hidden test names. */
export function fluencyHidden(type: FluencyKind, slug: string): string[] {
  const dir = path.join(FLUENCY_ROOT, type, slug);
  const out: string[] = [];
  const yaml = fs.readFileSync(path.join(dir, "item.yaml"), "utf8");
  for (const m of yaml.matchAll(/^\s+explanation: (.+)$/gm)) out.push(m[1]!.replace(/^"|"$/g, "").slice(0, 60));
  for (const sub of ["bugtests", "tests_hidden"]) {
    const d = path.join(dir, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) for (const m of fs.readFileSync(path.join(d, f), "utf8").matchAll(/def (test_\w+)/g)) out.push(m[1]!);
  }
  return out;
}

/** Every file under an extension item's reference/ overlay: path → text. */
export function fluencyReference(slug: string): Record<string, string> {
  const root = path.join(FLUENCY_ROOT, "extension", slug, "reference");
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else out[p] = fs.readFileSync(path.join(root, p), "utf8");
    }
  };
  walk("");
  return out;
}

/** A file of a content item as shipped to the candidate (comprehension code/, review head/, extension repo/). */
export function fluencyFile(type: FluencyKind, slug: string, file: string): string {
  const root = path.join(FLUENCY_ROOT, type, slug, type === "comprehension" ? "code" : type === "review" ? "head" : "repo");
  return fs.readFileSync(path.join(root, file), "utf8");
}

/** Opens a file in the fluency workspace's tree and replaces its content. */
export async function setWorkspaceFile(page: Page, file: string, code: string): Promise<void> {
  await page.getByTestId(`tree-${file}`).click();
  await page.waitForFunction((f) => (window as unknown as { __swemockEditorLabel?: string }).__swemockEditorLabel?.endsWith(`:${f}`), file);
  await setCode(page, code);
}

/** Starts a mock interview from an AI Fluency item page and returns its id. */
export async function startFluencyInterview(page: Page, type: FluencyKind, slug: string, interviewer: "AI interviewer" | "Scripted interviewer" | "In another chat"): Promise<string> {
  await page.goto(`/ai-fluency/${type}/${slug}`);
  await page.getByTestId("open-interview").click();
  await page.getByRole("dialog", { name: "Start a mock interview" }).getByLabel(interviewer).check();
  await page.getByTestId("start-interview").click();
  await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
  return page.url().split("/").pop()!;
}

/** Turns fallible mode on or off through the settings API. */
export async function setFallible(page: Page, on: boolean): Promise<void> {
  const res = await page.request.patch("/api/settings", { data: { features: { voiceInput: false, fallibleMode: on } } });
  expect(res.ok(), await res.text()).toBe(true);
}
