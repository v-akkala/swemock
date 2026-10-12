import Link from "next/link";
import { dsaFacets, listDsa, type DsaFilters } from "@/server/content/repo";
import { dueReviews } from "@/server/dsa/srs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "DSA problems · swemock" };

const DIFFICULTY_STYLE = {
  easy: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  hard: "text-red-600 dark:text-red-400",
} as const;

const STATUS_ICON = { solved: "✓", attempted: "◐", unsolved: "○" } as const;
const STATUS_LABEL = { solved: "Solved", attempted: "Attempted", unsolved: "Not started" } as const;

function first(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export default async function DsaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters: DsaFilters = {
    tag: first(sp.tag),
    difficulty: first(sp.difficulty),
    status: first(sp.status),
    company: first(sp.company),
    q: first(sp.q),
  };
  const problems = listDsa(filters);
  const facets = dsaFacets();
  const reviews = dueReviews();
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const solved = listDsa().filter((p) => p.status === "solved").length;
  const total = listDsa().length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DSA problems</h1>
          <p className="text-muted-foreground mt-1 text-sm" data-testid="progress">
            {solved} of {total} solved
          </p>
        </div>
        <Link href="/dsa/oa" className="hover:bg-muted rounded-md border border-border px-3 py-1.5 text-sm">
          Online assessment mode →
        </Link>
      </div>

      {reviews.length > 0 && (
        <section aria-labelledby="reviews-heading" className="rounded-lg border border-border p-4" data-testid="due-reviews">
          <h2 id="reviews-heading" className="font-semibold">
            Due for review ({reviews.length})
          </h2>
          <p className="text-muted-foreground mb-2 text-sm">Problems you needed help with, scheduled to come back after 1, 3, 7, and 14 days.</p>
          <ul className="flex flex-wrap gap-2">
            {reviews.map((r) => (
              <li key={r.slug}>
                <Link href={`/dsa/${r.slug}`} className="hover:bg-muted rounded-md border border-border px-2 py-1 text-sm">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter problems">
        <Field label="Search">
          <input name="q" defaultValue={filters.q} placeholder="Title or topic" className="bg-background rounded-md border border-border px-2 py-1.5 text-sm" />
        </Field>
        <Select name="difficulty" label="Difficulty" value={filters.difficulty} options={["easy", "medium", "hard"]} />
        <Select name="tag" label="Topic" value={filters.tag} options={facets.tags} />
        <Select name="status" label="Status" value={filters.status} options={["unsolved", "attempted", "solved"]} />
        {facets.companies.length > 0 && <Select name="company" label="Company" value={filters.company} options={facets.companies} />}
        <button className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm">Filter</button>
        <Link href="/dsa" className="text-muted-foreground px-1 py-1.5 text-sm hover:underline">
          Clear
        </Link>
        <Link
          href={`/dsa/random${query ? `?${query}` : ""}`}
          className="hover:bg-muted ml-auto rounded-md border border-border px-3 py-1.5 text-sm"
          data-testid="random-problem"
        >
          🎲 Random from this list
        </Link>
      </form>

      {problems.length === 0 ? (
        <p className="text-muted-foreground text-sm">No problems match these filters.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border" data-testid="problem-list">
          {problems.map((p) => (
            <li key={p.slug}>
              <Link href={`/dsa/${p.slug}`} className="hover:bg-muted flex items-center gap-4 px-4 py-3">
                <span className={cn("w-4 text-center", p.status === "solved" && "text-emerald-600 dark:text-emerald-400")} title={STATUS_LABEL[p.status]}>
                  <span aria-hidden>{STATUS_ICON[p.status]}</span>
                  <span className="sr-only">{STATUS_LABEL[p.status]}</span>
                </span>
                <span className="flex-1 font-medium">{p.title}</span>
                <span className="text-muted-foreground hidden gap-1.5 text-xs sm:flex">
                  {p.tags.map((t) => (
                    <span key={t} className="bg-muted rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </span>
                <span className={cn("w-16 text-right text-sm capitalize", DIFFICULTY_STYLE[p.difficulty])}>{p.difficulty}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs">
      <span className="text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ""} className="bg-background rounded-md border border-border px-2 py-1.5 text-sm capitalize">
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}
