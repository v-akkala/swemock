import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { readSettings } from "@/server/settings";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default function Home() {
  // First run: offer AI setup once (it can be skipped).
  if (!readSettings(getDb()).onboardingDone) redirect("/setup");
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">Practice interviews, locally.</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Pick a round to practice. Everything runs on your machine, and no AI model is required.
        </p>
      </section>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="block h-full rounded-lg focus-visible:ring-2 focus-visible:outline-none">
              <Card className="hover:bg-muted h-full transition-colors">
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
                {item.milestone && (
                  <p className="text-muted-foreground mt-3 text-xs">Planned for {item.milestone}</p>
                )}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
