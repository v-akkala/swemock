import Link from "next/link";
import { notFound } from "next/navigation";
import { CODEGEN, LANGUAGES, LANGUAGE_LABELS } from "@swemock/shared";
import { getDsa } from "@/server/content/repo";
import { getOa, oaResults } from "@/server/dsa/oa";
import { loadDrafts, sessionEvents } from "@/server/dsa/store";
import { OaShell, type OaProblem } from "./oa-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Online assessment · swemock" };

export default async function OaRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const oa = getOa(id);
  if (!oa) notFound();

  if (oa.session.status !== "active") return <OaResults sessionId={id} />;

  const accepted = new Set(
    sessionEvents<{ slug: string; verdict: string }>(id, "submit")
      .filter((e) => e.payload.verdict === "accepted")
      .map((e) => e.payload.slug),
  );
  const problems: OaProblem[] = oa.state.slugs.map((slug) => {
    const problem = getDsa(slug)!;
    const drafts = loadDrafts(problem.id, id);
    const { pub } = problem;
    return {
      slug,
      workspace: {
        slug,
        title: pub.title,
        difficulty: pub.difficulty,
        tags: pub.tags,
        statementMd: pub.statementMd,
        languages: LANGUAGES.map((lang) => ({
          id: lang,
          label: LANGUAGE_LABELS[lang],
          monaco: lang === "cpp" ? "cpp" : "python",
          stub: CODEGEN[lang].stub(pub.signature),
          draft: drafts[lang] ?? null,
        })),
        samples: pub.visibleTests.map((t, i) => ({ id: t.id, label: `Sample ${i + 1}`, input: t.input })),
        mode: "oa" as const,
        sessionId: id,
        solved: accepted.has(slug),
        hintCount: pub.hintCount,
        initialHints: [],
        initialEditorial: null,
      },
    };
  });

  return <OaShell sessionId={id} deadline={oa.state.deadline} serverNow={oa.now} problems={problems} />;
}

function OaResults({ sessionId }: { sessionId: string }) {
  const oa = getOa(sessionId)!;
  const { problems, score } = oaResults(oa.session);
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8" data-testid="oa-results">
        <div>
          <h1 className="text-2xl font-semibold">Assessment complete</h1>
          <p className="mt-1 text-4xl font-bold" data-testid="oa-score">
            {score}%
          </p>
          <p className="text-muted-foreground text-sm">Average of your best result on each problem: the share of tests passed.</p>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {problems.map((p) => {
            const problem = getDsa(p.slug);
            return (
              <li key={p.slug} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1">
                  <p className="font-medium">{problem?.pub.title ?? p.slug}</p>
                  <p className="text-muted-foreground text-xs">
                    {p.best
                      ? `Best: ${p.best.passed}/${p.best.total} tests (${p.best.verdict.replace(/_/g, " ")}, ${p.best.language}) · ${p.submissions} submission${p.submissions === 1 ? "" : "s"}`
                      : "No submissions"}
                  </p>
                </div>
                <Link href={`/dsa/${p.slug}`} className="hover:bg-muted rounded-md border border-border px-3 py-1 text-sm">
                  Review problem
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/dsa/oa" className="text-primary text-sm underline-offset-4 hover:underline">
          Start another assessment
        </Link>
      </div>
    </div>
  );
}
