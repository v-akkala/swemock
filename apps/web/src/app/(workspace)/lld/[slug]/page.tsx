import Link from "next/link";
import { notFound } from "next/navigation";
import { LANGUAGE_LABELS, LANGUAGES } from "@swemock/shared";
import { LldWorkspace } from "@/components/lld/workspace";
import { StartInterview } from "@/components/interview/start-interview";
import { resolveAi } from "@/server/ai/config";
import { loadLldPage } from "@/server/lld/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const data = loadLldPage((await params).slug);
  return { title: data ? `${data.pub.title} · swemock` : "Problem not found" };
}

export default async function LldProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = loadLldPage(slug);
  if (!data) notFound();
  const { pub } = data;
  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-1 text-sm">
        <Link href="/lld" className="text-muted-foreground hover:underline">
          ← All problems
        </Link>
        <StartInterview slug={slug} round="lld" minutes={pub.minutes} aiConnected={resolveAi().connected} />
      </div>
      <div className="min-h-0 flex-1">
        <LldWorkspace
          key={slug}
          slug={slug}
          title={pub.title}
          difficulty={pub.difficulty}
          tags={pub.tags}
          format={pub.format}
          specMd={pub.specMd}
          languages={LANGUAGES.filter((id) => pub.languages[id]).map((id) => ({
            id,
            label: LANGUAGE_LABELS[id],
            monaco: id === "cpp" ? "cpp" : "python",
            files: pub.languages[id]!.files.map((f) => ({ ...f, draft: data.drafts[id]?.[f.path] ?? null })),
            visibleTests: pub.languages[id]!.visibleTests,
          }))}
          mode="practice"
          sessionId={data.sessionId}
          solved={data.solved}
          hintCount={pub.hintCount}
          initialHints={data.revealedHints}
          initialReveal={data.reveal}
          initialChange={data.change}
          aiConnected={resolveAi().connected}
        />
      </div>
    </div>
  );
}
