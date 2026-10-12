import {
  LANGUAGES,
  LIMITS,
  dsaRunRequestSchema,
  dsaRunResultSchema,
  projectRunRequestSchema,
  projectRunResultSchema,
  type DsaRunResult,
  type Language,
  type ProjectRunResult,
  type RunnerHealth,
  type TestCategory,
} from "@swemock/shared";
import { z } from "zod";
import { buildDsaBundle, buildProjectBundle, bundleSize, type Bundle } from "./bundles";
import type { RunnerConfig } from "./config";
import type { Docker } from "./docker";
import { PROFILES } from "./languages";
import { runInSandbox, SANDBOX_LABEL } from "./sandbox";
import { Semaphore } from "./semaphore";

export class BadRequestError extends Error {
  constructor(
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
  }
}

/** What the agent reports for DSA before the runner adds totals. */
const agentDsaSchema = z.object({
  verdict: dsaRunResultSchema.shape.verdict,
  compileOutput: z.string().nullable(),
  tests: dsaRunResultSchema.shape.tests,
});

const agentProjectSchema = projectRunResultSchema.extend({
  tests: z.array(projectRunResultSchema.shape.tests.unwrap().element.omit({ category: true })).nullable(),
});

export class Judge {
  private readonly semaphore: Semaphore;

  constructor(
    private readonly docker: Docker,
    private readonly config: RunnerConfig,
  ) {
    this.semaphore = new Semaphore(config.maxConcurrent, config.maxQueued);
  }

  imageFor(language: Language): string {
    return `${this.config.imagePrefix}${PROFILES[language].image}:${this.config.imageTag}`;
  }

  async status(): Promise<RunnerHealth> {
    const docker = await this.docker.ping();
    const languages = Object.fromEntries(LANGUAGES.map((l) => [l, false])) as Record<Language, boolean>;
    let error: string | null = docker ? null : "Cannot reach the Docker daemon from the runner.";
    if (docker) {
      for (const l of LANGUAGES) languages[l] = await this.docker.imageExists(this.imageFor(l)).catch(() => false);
      const missing = LANGUAGES.filter((l) => !languages[l]);
      if (missing.length) error = `Sandbox image missing: ${missing.map((l) => this.imageFor(l)).join(", ")}`;
    }
    return { ok: docker && error === null, docker, version: this.config.version, languages, error };
  }

  /** Removes sandbox containers left behind by a crash. */
  async cleanup(): Promise<number> {
    const ids = await this.docker.listByLabel(SANDBOX_LABEL);
    await Promise.all(ids.map((id) => this.docker.remove(id)));
    return ids.length;
  }

  async runDsa(body: unknown): Promise<DsaRunResult> {
    const req = parse(dsaRunRequestSchema, body);
    const raw = await this.execute(buildDsaBundle(req));
    const agent = parse(agentDsaSchema, raw, "agent");
    const tests = agent.tests;
    const times = tests.map((t) => t.timeMs).filter((t): t is number => t !== null);
    const mems = tests.map((t) => t.memoryKb).filter((m): m is number => m !== null);
    return dsaRunResultSchema.parse({
      ...agent,
      passed: tests.filter((t) => t.verdict === "accepted").length,
      total: req.tests.length,
      maxTimeMs: times.length ? Math.max(...times) : null,
      maxMemoryKb: mems.length ? Math.max(...mems) : null,
    });
  }

  async runProject(body: unknown): Promise<ProjectRunResult> {
    const req = parse(projectRunRequestSchema, body);
    const projectBytes = Object.values(req.files).reduce((n, f) => n + Buffer.byteLength(f), 0);
    if (projectBytes > LIMITS.maxProjectBytes) throw new BadRequestError("Workspace is too large.");
    const categorize = categorizer(req.categories);
    const agent = parse(agentProjectSchema, await this.execute(buildProjectBundle(req)), "agent");
    return projectRunResultSchema.parse({
      ...agent,
      tests: agent.tests?.map((t) => ({ ...t, category: categorize(`${t.classname}.${t.name}`) })) ?? null,
    });
  }

  private async execute(bundle: Bundle): Promise<unknown> {
    if (bundleSize(bundle) > LIMITS.maxBundleBytes) throw new BadRequestError("Request is too large.");
    const image = this.imageFor(bundle.language);
    return this.semaphore.run(async () => (await runInSandbox(this.docker, image, bundle)).result);
  }
}

function parse<S extends z.ZodType>(schema: S, value: unknown, who: "request" | "agent" = "request"): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  if (who === "agent") throw new Error(`Unexpected sandbox output: ${r.error.message.slice(0, 500)}`);
  throw new BadRequestError("Invalid request", r.error.issues);
}

function categorizer(rules: { pattern: string; category: TestCategory }[]) {
  const compiled = rules.map((r) => {
    try {
      return { re: new RegExp(r.pattern), category: r.category };
    } catch {
      throw new BadRequestError(`Invalid category pattern: ${r.pattern}`);
    }
  });
  return (name: string): TestCategory => compiled.find((r) => r.re.test(name))?.category ?? "core";
}
