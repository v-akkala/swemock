import Link from "next/link";
import { listLld } from "@/server/content/lld";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Low-Level Design · swemock" };

const DIFFICULTY_STYLE = {
  easy: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  hard: "text-red-600 dark:text-red-400",
} as const;
const STATUS_ICON = { solved: "✓", attempted: "◐", unsolved: "○" } as const;
const STATUS_LABEL = { solved: "Solved", attempted: "Attempted", unsolved: "Not started" } as const;
const LANG_LABEL: Record<string, string> = { python: "Python", cpp: "C++" };

export default async function LldPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const all = listLld();
  const items = all.filter((p) => (!sp.format || p.format === sp.format) && (!sp.difficulty || p.difficulty === sp.difficulty));
  const solved = all.filter((p) => p.status === "solved").length;
  const link = (key: string, value?: string) => {
    const q = new URLSearchParams(Object.entries({ ...sp, [key]: value }).filter(([, v]) => v) as [string, string][]).toString();
    return q ? `/lld?${q}` : "/lld";
  };
  const chip = (active: boolean) => cn("rounded-full border border-border px-3 py-1 text-xs", active && "bg-muted font-medium");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Low-Level Design</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm" data-testid="progress">
          {solved} of {all.length} solved. Design and implement a small system against hidden unit tests: either <strong>complete the system</strong> around code you are given,
          or <strong>implement one class</strong> from a spec. In an interview, a new requirement arrives about 60% of the way in.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Filters">
        <Link href={link("format", undefined)} className={chip(!sp.format)}>
          Any format
        </Link>
        <Link href={link("format", "system")} className={chip(sp.format === "system")}>
          Complete the system
        </Link>
        <Link href={link("format", "class")} className={chip(sp.format === "class")}>
          Implement the class
        </Link>
        <span className="mx-2" />
        {(["easy", "medium", "hard"] as const).map((d) => (
          <Link key={d} href={link("difficulty", sp.difficulty === d ? undefined : d)} className={chip(sp.difficulty === d)}>
            {d}
          </Link>
        ))}
      </div>
      <table className="w-full text-left text-sm" data-testid="lld-list">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="w-8 py-1"></th>
            <th>Problem</th>
            <th>Format</th>
            <th>Difficulty</th>
            <th>Languages</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="py-2" title={STATUS_LABEL[p.status]}>
                <span aria-label={STATUS_LABEL[p.status]}>{STATUS_ICON[p.status]}</span>
              </td>
              <td>
                <Link href={`/lld/${p.slug}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <span className="text-muted-foreground ml-2 text-xs">{p.tags.join(" · ")}</span>
              </td>
              <td>{p.format === "system" ? "Complete the system" : "Implement the class"}</td>
              <td className={cn("capitalize", DIFFICULTY_STYLE[p.difficulty])}>{p.difficulty}</td>
              <td>{p.languages.map((l) => LANG_LABEL[l] ?? l).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-sm">No problems match those filters.</p>}
    </div>
  );
}
