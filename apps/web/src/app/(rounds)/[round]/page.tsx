import { notFound } from "next/navigation";
import { NAV_ITEMS, findNavItem } from "@/lib/nav";

export const dynamicParams = false;

export function generateStaticParams() {
  return NAV_ITEMS.filter((item) => item.milestone).map((item) => ({ round: item.href.slice(1) }));
}

/** Landing page for sections that are not built yet. Replaced by a real route when its milestone lands. */
export default async function PlannedSection({ params }: { params: Promise<{ round: string }> }) {
  const item = findNavItem((await params).round);
  if (!item?.milestone) notFound();
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{item.label}</h1>
      <p className="text-muted-foreground mt-2">{item.description}</p>
      <p className="mt-6 text-sm">
        This section is planned for milestone <strong>{item.milestone}</strong> and isn&apos;t available yet.
      </p>
    </div>
  );
}
