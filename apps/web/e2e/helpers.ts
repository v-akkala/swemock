import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

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
export function recordResponses(page: Page): { bodies: string[] } {
  const rec = { bodies: [] as string[] };
  page.on("response", async (res) => {
    try {
      const type = res.headers()["content-type"] ?? "";
      if (/json|html|text|javascript/.test(type) && res.status() < 400) rec.bodies.push(await res.text());
    } catch {
      /* body not available (redirect, aborted) */
    }
  });
  return rec;
}
