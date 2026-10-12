import Link from "next/link";
import { countReviewed, listUnreviewed } from "@/server/content/repo";
import { ApproveButton } from "./approve-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content review · swemock" };

export default function ContentReviewPage() {
  const items = listUnreviewed();
  const { reviewed, total } = countReviewed();
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Content review</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Authored content starts out unreviewed. Read each item, then approve it. {reviewed} of {total} items reviewed.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm">Everything has been reviewed.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border" data-testid="unreviewed-list">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1">
                <Link href={`/${i.type}/${i.slug}`} className="font-medium hover:underline">
                  {i.title}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {i.type} · {i.difficulty} · version {i.version} · {i.source}
                </p>
              </div>
              <ApproveButton id={i.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
