import Link from "next/link";
import { competencyLabel, lensTagLabel } from "@swemock/shared";
import { resolveAi } from "@/server/ai/config";
import { listBehavioral } from "@/server/content/questions";
import { storyCoverage } from "@/server/stories";
import { BehavioralSetup } from "./behavioral-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Behavioral · swemock" };

export default function BehavioralPage() {
  const bank = listBehavioral();
  const { stories, coverage } = storyCoverage();
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Behavioral</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A mock interview of 4–6 questions with probing follow-ups and a soft timer per answer. Build your{" "}
          <Link href="/behavioral/stories" className="underline" data-testid="stories-link">
            story bank
          </Link>{" "}
          first: {stories.length === 0 ? "you have no stories yet" : `${stories.length} stor${stories.length === 1 ? "y" : "ies"}, ${coverage.gaps.length} competencies uncovered`}.
        </p>
      </div>
      <BehavioralSetup aiConnected={resolveAi().connected} gaps={coverage.gaps} />
      <section aria-labelledby="bank-heading" className="space-y-3">
        <h2 id="bank-heading" className="text-lg font-semibold">
          Question bank ({bank.length})
        </h2>
        <p className="text-muted-foreground text-sm">The follow-ups are kept for the interview; you&apos;ll see them in the debrief.</p>
        <ul className="divide-border divide-y text-sm" data-testid="behavioral-bank">
          {bank.map((q) => (
            <li key={q.id} className="py-2">
              <span className="font-medium">{q.title}</span>
              <span className="text-muted-foreground ml-2 text-xs">{q.competencies.map(competencyLabel).join(" · ")}</span>
              {q.lenses.length > 0 && <span className="text-muted-foreground ml-2 text-xs">[{q.lenses.map((l) => `${l.split(":")[0]}: ${lensTagLabel(l)}`).join(", ")}]</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
