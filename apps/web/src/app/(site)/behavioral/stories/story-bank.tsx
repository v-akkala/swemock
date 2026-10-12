"use client";

import { useState } from "react";
import { COMPETENCIES, competencyLabel, type Coverage } from "@swemock/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { StoryInput, StoryView } from "@/server/stories";

interface Data {
  stories: StoryView[];
  coverage: Coverage;
}

const EMPTY: StoryInput = { title: "", situation: "", task: "", action: "", result: "", metrics: "", reflection: "", competencies: [] };

const FIELDS: { key: keyof Omit<StoryInput, "title" | "competencies">; label: string; hint: string }[] = [
  { key: "situation", label: "Situation", hint: "Where and when; what was going on, in two sentences." },
  { key: "task", label: "Task", hint: "What you were responsible for." },
  { key: "action", label: "Action", hint: "What YOU did, step by step. Use \"I\"." },
  { key: "result", label: "Result", hint: "What happened because of it." },
  { key: "metrics", label: "Metrics", hint: "Numbers: time saved, error rate, users, money." },
  { key: "reflection", label: "Reflection", hint: "What you learned or would do differently." },
];

export function StoryBank({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(initial.stories.length === 0 ? "new" : null);
  const [form, setForm] = useState<StoryInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setData(await api<Data>("/api/stories", "GET"));

  function edit(story: StoryView | "new") {
    setError(null);
    if (story === "new") {
      setForm(EMPTY);
      setEditing("new");
    } else {
      setForm({
        title: story.title,
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        metrics: story.metrics,
        reflection: story.reflection,
        competencies: story.competencies,
      });
      setEditing(story.id);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") await api("/api/stories", "POST", form);
      else await api(`/api/stories/${editing}`, "PUT", form);
      await refresh();
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this story?")) return;
    await api(`/api/stories/${id}`, "DELETE", {});
    await refresh();
  }

  const toggle = (id: StoryInput["competencies"][number]) =>
    setForm((f) => ({ ...f, competencies: f.competencies.includes(id) ? f.competencies.filter((c) => c !== id) : [...f.competencies, id] }));

  return (
    <div className="space-y-8">
      <section aria-labelledby="stories-heading" className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 id="stories-heading" className="text-lg font-semibold">
            Your stories ({data.stories.length})
          </h2>
          {editing === null && (
            <Button variant="outline" className="h-8" onClick={() => edit("new")} data-testid="new-story">
              Add a story
            </Button>
          )}
        </div>
        <ul className="space-y-2" data-testid="story-list">
          {data.stories.map((s) => (
            <li key={s.id} className="bg-card flex items-start gap-3 rounded-md border border-border p-3 text-sm">
              <div className="flex-1">
                <p className="font-medium">{s.title}</p>
                <p className="text-muted-foreground text-xs">{s.competencies.length ? s.competencies.map(competencyLabel).join(" · ") : "No competencies tagged yet"}</p>
              </div>
              <button type="button" className="text-xs underline" onClick={() => edit(s)}>
                Edit
              </button>
              <button type="button" className="text-muted-foreground text-xs underline" onClick={() => void remove(s.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>

        {editing !== null && (
          <form
            className="bg-card space-y-3 rounded-md border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            data-testid="story-form"
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-background h-9 w-full rounded-md border border-border px-2" data-testid="story-title" />
            </label>
            {FIELDS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="mb-1 block font-medium">
                  {f.label} <span className="text-muted-foreground text-xs font-normal">{f.hint}</span>
                </span>
                <textarea value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="bg-background h-20 w-full rounded-md border border-border p-2 text-sm" data-testid={`story-${f.key}`} />
              </label>
            ))}
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Competencies this story can answer</legend>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {COMPETENCIES.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.competencies.includes(c.id)} onChange={() => toggle(c.id)} data-testid={`tag-${c.id}`} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={busy} data-testid="save-story">
                {busy ? "Saving…" : "Save story"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              {error && <span role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</span>}
            </div>
          </form>
        )}
      </section>

      <Matrix data={data} />
    </div>
  );
}

function Matrix({ data }: { data: Data }) {
  const { stories, coverage } = data;
  return (
    <section aria-labelledby="matrix-heading" className="space-y-3" data-testid="coverage">
      <h2 id="matrix-heading" className="text-lg font-semibold">
        Coverage
      </h2>
      {stories.length === 0 ? (
        <p className="text-muted-foreground text-sm">Add a story to see which competencies it covers.</p>
      ) : (
        <>
          <ul className="space-y-1 text-sm" data-testid="coverage-flags">
            {coverage.gaps.length > 0 && (
              <li>
                <strong>No story for:</strong> {coverage.gaps.map(competencyLabel).join(", ")}.
              </li>
            )}
            {coverage.overused.map((o) => (
              <li key={o.storyId} className="text-amber-700 dark:text-amber-300">
                <strong>Over-reliance:</strong> &ldquo;{o.title}&rdquo; is your only story for {o.soleFor.map(competencyLabel).join(", ")}. Add another example for one of them.
              </li>
            ))}
            {coverage.gaps.length === 0 && coverage.overused.length === 0 && <li>Every competency has a story, and none carries the whole load.</li>}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Competency</th>
                  {stories.map((s) => (
                    <th key={s.id} className="max-w-28 px-2 text-center font-medium" title={s.title}>
                      <span className="line-clamp-2">{s.title}</span>
                    </th>
                  ))}
                  <th className="px-2 font-medium">Stories</th>
                </tr>
              </thead>
              <tbody>
                {coverage.rows.map((r) => (
                  <tr key={r.competency} className="border-t border-border" data-testid={`row-${r.competency}`} data-count={r.storyIds.length}>
                    <th scope="row" className={cn("py-1 pr-3 font-normal", r.storyIds.length === 0 && "text-red-600 dark:text-red-400")}>
                      {r.label}
                    </th>
                    {stories.map((s) => (
                      <td key={s.id} className="px-2 text-center">
                        {r.storyIds.includes(s.id) ? <span aria-label={`${s.title} covers ${r.label}`}>●</span> : <span className="text-muted-foreground/40" aria-hidden>·</span>}
                      </td>
                    ))}
                    <td className="px-2 tabular-nums">{r.storyIds.length === 0 ? "none" : r.storyIds.length === 1 ? "only one" : r.storyIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
