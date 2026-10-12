import Link from "next/link";
import { notFound } from "next/navigation";
import { CODEGEN, LANGUAGES, LANGUAGE_LABELS } from "@swemock/shared";
import { ProblemWorkspace } from "@/components/dsa/workspace";
import { loadProblemPage } from "@/server/dsa/service";
import { loadDrafts } from "@/server/dsa/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const data = loadProblemPage((await params).slug);
  return { title: data ? `${data.pub.title} · swemock` : "Problem not found" };
}

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = loadProblemPage(slug);
  if (!data) notFound();
  const drafts = loadDrafts(data.itemId, null);
  const { pub } = data;

  return (
    <div className="flex h-full flex-col">
      <div className="border-border shrink-0 border-b px-4 py-1.5 text-sm">
        <Link href="/dsa" className="text-muted-foreground hover:underline">
          ← All problems
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <ProblemWorkspace
          key={slug}
          slug={slug}
          title={pub.title}
          difficulty={pub.difficulty}
          tags={pub.tags}
          statementMd={pub.statementMd}
          languages={LANGUAGES.map((id) => ({
            id,
            label: LANGUAGE_LABELS[id],
            monaco: id === "cpp" ? "cpp" : "python",
            stub: CODEGEN[id].stub(pub.signature),
            draft: drafts[id] ?? null,
          }))}
          samples={pub.visibleTests.map((t, i) => ({ id: t.id, label: `Sample ${i + 1}`, input: t.input }))}
          mode="practice"
          sessionId={data.sessionId}
          solved={data.solved}
          hintCount={pub.hintCount}
          initialHints={data.revealedHints}
          initialEditorial={data.editorial}
        />
      </div>
    </div>
  );
}
