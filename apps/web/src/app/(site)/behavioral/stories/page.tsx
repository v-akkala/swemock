import Link from "next/link";
import { storyCoverage } from "@/server/stories";
import { StoryBank } from "./story-bank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Story bank · swemock" };

export default function StoriesPage() {
  const data = storyCoverage();
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/behavioral" className="text-muted-foreground text-sm hover:underline">
          ← Behavioral
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Story bank</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Write down five to eight real stories (situation, task, action, result, with numbers) and tag the competencies each one can answer. The matrix shows
          what you can&apos;t answer yet, and which story you lean on too much. Nothing here leaves your machine unless you copy a packet.
        </p>
      </div>
      <StoryBank initial={data} />
    </div>
  );
}
