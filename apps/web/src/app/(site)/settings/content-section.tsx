import Link from "next/link";
import { contentDir } from "@/server/config";
import { countReviewed, listDsa } from "@/server/content/repo";

export function ContentSection() {
  const { reviewed, total } = countReviewed();
  const problems = listDsa().length;
  return (
    <section id="content" aria-labelledby="content-heading" className="space-y-2">
      <h2 id="content-heading" className="text-lg font-semibold">
        Content
      </h2>
      <p className="text-muted-foreground text-sm">
        {problems} DSA problem{problems === 1 ? "" : "s"} loaded from <code className="font-mono">{contentDir()}</code>. New or edited
        problems show up within a few seconds. {reviewed} of {total} items reviewed.
      </p>
      <p className="text-sm">
        <Link href="/content-review" className="text-primary underline-offset-4 hover:underline">
          Review unreviewed content
        </Link>
      </p>
    </section>
  );
}
