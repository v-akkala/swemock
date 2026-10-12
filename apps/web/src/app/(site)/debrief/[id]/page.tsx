import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadDebrief } from "@/server/debrief";
import { DebriefView } from "./debrief-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Debrief · swemock" };

export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = loadDebrief(id);
  if (!data) notFound();
  if (data.session.status === "active" && data.session.mode === "interview") redirect(`/interview/${id}`);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/history" className="text-muted-foreground text-sm hover:underline">
          ← History
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          Debrief{data.problem ? `: ${data.problem.title}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          {data.session.mode === "interview" ? "Mock interview" : data.session.mode === "oa" ? "Online assessment" : "Practice"} ·{" "}
          {new Date(data.session.startedAt).toLocaleString()}
          {data.session.endedAt && ` · ${Math.round((data.session.endedAt - data.session.startedAt) / 60_000)} min`}
          {data.session.mode === "interview" &&
            ` · ${data.liveVia === "packet" ? "interviewed in another chat" : data.session.driver === "llm" ? "AI interviewer" : "scripted interviewer"}`}
        </p>
      </div>
      <DebriefView data={data} />
    </div>
  );
}
