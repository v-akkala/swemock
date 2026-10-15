import Link from "next/link";
import { notFound } from "next/navigation";
import { FluencyWorkspace } from "@/components/fluency/workspace";
import { StartInterview } from "@/components/interview/start-interview";
import { FLUENCY_TYPES, type FluencyType } from "@/lib/fluency-types";
import { resolveAi } from "@/server/ai/config";
import { loadFluencyPage, startingFiles } from "@/server/fluency/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  const data = FLUENCY_TYPES.includes(type as FluencyType) ? loadFluencyPage(type as FluencyType, slug) : null;
  return { title: data ? `${data.pub.title} · swemock` : "Not found" };
}

export default async function FluencyPage({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  if (!FLUENCY_TYPES.includes(type as FluencyType)) notFound();
  const t = type as FluencyType;
  const data = loadFluencyPage(t, slug);
  if (!data) notFound();
  const aiConnected = resolveAi().connected;
  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-1 text-sm">
        <Link href="/ai-fluency" className="text-muted-foreground hover:underline">
          ← All exercises
        </Link>
        <StartInterview slug={slug} round="fluency" fluencyType={t} minutes={data.pub.minutes} aiConnected={aiConnected} />
      </div>
      <div className="min-h-0 flex-1">
        <FluencyWorkspace
          key={`${t}/${slug}`}
          type={t}
          slug={slug}
          pub={data.pub}
          startFiles={startingFiles(t, data.pub)}
          drafts={data.drafts}
          sessionId={data.sessionId}
          mode="practice"
          aiConnected={aiConnected}
          initialFindings={data.findings}
          initialSummary={data.summary}
          initialDecision={data.decision}
        />
      </div>
    </div>
  );
}
