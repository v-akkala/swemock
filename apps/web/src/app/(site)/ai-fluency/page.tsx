import Link from "next/link";
import { listFluency } from "@/server/content/fluency";
import { FLUENCY_TYPES, type FluencyType } from "@/lib/fluency-types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Fluency · swemock" };

const SECTIONS: Record<FluencyType, { title: string; blurb: string; minutes: string }> = {
  comprehension: {
    title: "Code comprehension",
    blurb: "An unfamiliar codebase with planted bugs. Summarize it, find the bugs with gutter annotations, discuss the design decisions, and propose improvements. The AI assistant is yours to use; how you check its answers is part of the score.",
    minutes: "60 min",
  },
  review: {
    title: "AI-generated code review",
    blurb: "A pull request written by an AI agent. Read the diff, comment on the lines that matter, and decide: approve, request changes, or reject. Some PRs are fine: over-flagging costs you.",
    minutes: "40 min",
  },
  extension: {
    title: "Feature extension",
    blurb: "Add a feature to an existing repository, following its conventions, with its tests as your safety net. Use the assistant, and review what it writes.",
    minutes: "45-60 min",
  },
};
const DIFFICULTY_STYLE = { easy: "text-emerald-600 dark:text-emerald-400", medium: "text-amber-600 dark:text-amber-400", hard: "text-red-600 dark:text-red-400" } as const;
const STATUS_ICON = { solved: "✓", attempted: "◐", unsolved: "○" } as const;

export default function AiFluencyPage() {
  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">AI Fluency</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Interviews that expect you to work with an AI assistant. Every question you ask, everything you attach, and every change you accept is logged and shown in the debrief. Turn on
          &ldquo;Fallible mode&rdquo; in Settings and the assistant will occasionally slip a plausible mistake into its code; see whether you catch it.
        </p>
      </div>
      {FLUENCY_TYPES.map((type) => {
        const items = listFluency(type);
        return (
          <section key={type} aria-labelledby={`${type}-h`} className="space-y-3" data-testid={`section-${type}`}>
            <div>
              <h2 id={`${type}-h`} className="text-lg font-semibold">
                {SECTIONS[type].title} <span className="text-muted-foreground text-sm font-normal">· {SECTIONS[type].minutes}</span>
              </h2>
              <p className="text-muted-foreground max-w-3xl text-sm">{SECTIONS[type].blurb}</p>
            </div>
            <ul className="divide-border divide-y text-sm">
              {items.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <span aria-hidden>{STATUS_ICON[p.status]}</span>
                  <Link href={`/ai-fluency/${type}/${p.slug}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <span className="text-muted-foreground text-xs">{p.tags.join(" · ")}</span>
                  <span className={cn("ml-auto capitalize", DIFFICULTY_STYLE[p.difficulty])}>{p.difficulty}</span>
                  <span className="text-muted-foreground w-20 text-right text-xs">{p.language === "cpp" ? "C++" : "Python"}</span>
                </li>
              ))}
              {items.length === 0 && <li className="text-muted-foreground py-2 text-xs">Nothing here yet.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
