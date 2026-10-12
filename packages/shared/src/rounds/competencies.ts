/**
 * Behavioral vocabulary shared by content (question tags), the story bank, and the coverage matrix.
 * Closed lists, so a typo can't create a stray tag. Adding one is a one-line change.
 */
export const COMPETENCIES = [
  { id: "ownership", label: "Ownership and initiative" },
  { id: "conflict", label: "Conflict and disagreement" },
  { id: "failure", label: "Failure and being wrong" },
  { id: "pressure", label: "Deadlines and pressure" },
  { id: "ambiguity", label: "Ambiguity" },
  { id: "leadership", label: "Leading without authority" },
  { id: "feedback", label: "Giving and receiving feedback" },
  { id: "prioritization", label: "Prioritization" },
  { id: "learning", label: "Learning quickly" },
  { id: "customer-focus", label: "Customer impact" },
  { id: "judgment", label: "Deciding with incomplete data" },
  { id: "communication", label: "Explaining complex things" },
  { id: "teamwork", label: "Helping and collaborating" },
  { id: "adaptability", label: "Changing scope and plans" },
  { id: "technical-depth", label: "Technical depth and tradeoffs" },
  { id: "motivation", label: "Motivation and fit" },
] as const;

export type CompetencyId = (typeof COMPETENCIES)[number]["id"];
export const COMPETENCY_IDS = COMPETENCIES.map((c) => c.id) as [CompetencyId, ...CompetencyId[]];
export const competencyLabel = (id: string): string => COMPETENCIES.find((c) => c.id === id)?.label ?? id;

/** Optional company lenses (spec §8.5): short tags, wording is ours. */
export const LENSES = [
  { id: "amazon", label: "Amazon-style leadership principles" },
  { id: "google", label: "Google-style (Googleyness)" },
  { id: "meta", label: "Meta-style" },
] as const;
export type LensId = (typeof LENSES)[number]["id"];

export const LENS_TAGS = [
  "amazon:customer-obsession",
  "amazon:ownership",
  "amazon:invent-and-simplify",
  "amazon:are-right-a-lot",
  "amazon:learn-and-be-curious",
  "amazon:hire-and-develop-the-best",
  "amazon:highest-standards",
  "amazon:think-big",
  "amazon:bias-for-action",
  "amazon:frugality",
  "amazon:earn-trust",
  "amazon:dive-deep",
  "amazon:have-backbone",
  "amazon:deliver-results",
  "google:comfort-with-ambiguity",
  "google:collaboration",
  "google:valuing-feedback",
  "google:user-focus",
  "google:doing-the-right-thing",
  "google:humility",
  "google:challenging-status-quo",
  "meta:move-fast",
  "meta:be-bold",
  "meta:focus-on-impact",
  "meta:be-open",
  "meta:build-for-people",
] as const;
export type LensTag = (typeof LENS_TAGS)[number];

export const lensOf = (tag: string): LensId => tag.split(":")[0] as LensId;
export const lensTagLabel = (tag: string): string => tag.split(":")[1]!.replace(/-/g, " ");

/** CS fundamentals topics (spec §8.1). */
export const CS_TOPICS = [
  "data-structures",
  "oop",
  "os",
  "concurrency",
  "networking",
  "databases",
  "memory",
  "cpp",
  "python",
  "systems",
  "security",
  "tooling",
] as const;
export type CsTopic = (typeof CS_TOPICS)[number];

export const CS_TOPIC_LABELS: Record<CsTopic, string> = {
  "data-structures": "Data structures and Big-O",
  oop: "Object-oriented design",
  os: "Operating systems",
  concurrency: "Concurrency",
  networking: "Networking",
  databases: "Databases",
  memory: "Memory management",
  cpp: "C++",
  python: "Python",
  systems: "Caching, scaling, and systems basics",
  security: "Security basics",
  tooling: "Git, testing, and tooling",
};
