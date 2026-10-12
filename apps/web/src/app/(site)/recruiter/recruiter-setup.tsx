"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InterviewerChoice, type Interviewer } from "@/components/interview/interviewer-choice";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ResumeView } from "@/server/resume/store";

const ROLES = ["SWE intern", "New grad SWE", "MLE", "Quant developer"] as const;
const OTHER = "Other";

const FLAG_LABEL: Record<string, string> = {
  metric: "metric",
  number: "number",
  "strong-claim": "strong claim",
  buzzword: "buzzword",
  vague: "vague",
};

export function RecruiterSetup({ initialResumes, aiConnected }: { initialResumes: ResumeView[]; aiConnected: boolean }) {
  const router = useRouter();
  const [resumes, setResumes] = useState(initialResumes);
  const [selected, setSelected] = useState<string | "new">(initialResumes[0]?.id ?? "new");
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"paste" | "pdf">("paste");
  const [role, setRole] = useState<string>(ROLES[1]);
  const [otherRole, setOtherRole] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [choice, setChoice] = useState<Interviewer>(aiConnected ? "ai" : "scripted");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = resumes.find((r) => r.id === selected) ?? null;

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/resumes/pdf", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { text?: string; title?: string; error?: string };
      if (!res.ok || !json.text) throw new Error(json.error ?? `Couldn't read that file (${res.status}).`);
      setDraft(json.text);
      setTitle((t) => t || json.title || "");
      setSource("pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveResume() {
    setError(null);
    setBusy(true);
    try {
      const saved = await api<ResumeView>("/api/resumes", "POST", { title, text: draft, source });
      setResumes((r) => [saved, ...r]);
      setSelected(saved.id);
      setDraft("");
      setTitle("");
      setSource("paste");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this resume version? Past screens keep their own copy.")) return;
    await api(`/api/resumes/${id}`, "DELETE", {});
    const rest = resumes.filter((r) => r.id !== id);
    setResumes(rest);
    if (selected === id) setSelected(rest[0]?.id ?? "new");
  }

  async function start() {
    setError(null);
    const roleName = role === OTHER ? otherRole.trim() : role;
    if (!roleName) return setError("Say which role you are practicing for.");
    if (selected === "new" && draft.trim().length < 40) return setError("Add your resume first: paste the text or upload a PDF.");
    setBusy(true);
    try {
      let resumeId = current?.id;
      if (selected === "new") resumeId = (await api<ResumeView>("/api/resumes", "POST", { title, text: draft, source })).id;
      const { id } = await api<{ id: string }>("/api/interview", "POST", {
        round: "recruiter",
        interviewer: choice,
        resumeId,
        role: roleName,
        company,
        jobDescription: jd,
      });
      router.push(`/interview/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="resume-heading" className="space-y-3">
        <h2 id="resume-heading" className="text-lg font-semibold">
          1. Your resume
        </h2>
        <div className="space-y-2" role="radiogroup" aria-label="Resume version">
          {resumes.map((r) => (
            <label key={r.id} className={cn("flex items-start gap-2 rounded-md border border-border p-3 text-sm", selected === r.id && "border-primary")}>
              <input type="radio" name="resume" checked={selected === r.id} onChange={() => setSelected(r.id)} className="mt-1" data-testid="resume-option" />
              <span className="flex-1">
                <span className="block font-medium">
                  v{r.version}: {r.title}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {new Date(r.createdAt).toLocaleDateString()} · {r.source === "pdf" ? "from a PDF" : "pasted"} · {r.parsed.bullets.length} bullets found
                </span>
              </span>
              <button type="button" className="text-muted-foreground text-xs underline" onClick={() => void remove(r.id)}>
                Delete
              </button>
            </label>
          ))}
          <label className={cn("flex items-start gap-2 rounded-md border border-border p-3 text-sm", selected === "new" && "border-primary")}>
            <input type="radio" name="resume" checked={selected === "new"} onChange={() => setSelected("new")} className="mt-1" data-testid="resume-new" />
            <span className="font-medium">{resumes.length ? "A new version" : "Add your resume"}</span>
          </label>
        </div>

        {selected === "new" ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSource("paste");
              }}
              aria-label="Resume text"
              placeholder="Paste your resume as plain text. Section headings (Experience, Projects, Education, Skills) and bullet points are picked up automatically."
              className="bg-card h-56 w-full rounded-md border border-border p-2 font-mono text-xs"
              data-testid="resume-text"
            />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">or upload a PDF (text is extracted on this machine)</span>
                <input type="file" accept="application/pdf,.pdf" onChange={(e) => void upload(e.target.files?.[0])} data-testid="resume-pdf" className="text-xs" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name this version (optional)" aria-label="Resume version name" className="bg-card h-9 w-64 rounded-md border border-border px-2 text-sm" />
              <Button variant="outline" disabled={busy || draft.trim().length < 40} onClick={() => void saveResume()} data-testid="save-resume">
                Save as a version
              </Button>
            </div>
          </div>
        ) : (
          current && <ParsedPreview resume={current} />
        )}
      </section>

      <section aria-labelledby="target-heading" className="space-y-3">
        <h2 id="target-heading" className="text-lg font-semibold">
          2. The role
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Target role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-card h-9 w-full rounded-md border border-border px-2" data-testid="role">
              {[...ROLES, OTHER].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {role === OTHER && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Which role?</span>
              <input value={otherRole} onChange={(e) => setOtherRole(e.target.value)} className="bg-card h-9 w-full rounded-md border border-border px-2" data-testid="role-other" />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Company (optional)</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} className="bg-card h-9 w-full rounded-md border border-border px-2" data-testid="company" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Job description (optional)</span>
          <textarea value={jd} onChange={(e) => setJd(e.target.value)} className="bg-card h-28 w-full rounded-md border border-border p-2 text-xs" placeholder="Paste the posting so the recruiter can ask about the requirements." />
        </label>
      </section>

      <section aria-labelledby="start-heading" className="space-y-3">
        <h2 id="start-heading" className="text-lg font-semibold">
          3. Start
        </h2>
        <InterviewerChoice value={choice} onChange={setChoice} aiConnected={aiConnected} packetDetail="Copy a prompt (with your resume) into claude.ai or any assistant; this page keeps time and grades afterwards." />
        <Button onClick={() => void start()} disabled={busy} data-testid="start-recruiter">
          {busy ? "Starting…" : "Start the screen"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400" data-testid="setup-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function ParsedPreview({ resume }: { resume: ResumeView }) {
  const probes = resume.parsed.probes;
  return (
    <div className="bg-card space-y-2 rounded-md border border-border p-3 text-sm" data-testid="resume-preview">
      <p className="text-xs font-medium">
        {resume.parsed.sections.filter((s) => s.kind !== "other" || s.bullets.length).length} sections, {resume.parsed.bullets.length} bullets. A recruiter would likely probe:
      </p>
      {probes.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nothing stands out. The screen will ask about your proudest project instead.</p>
      ) : (
        <ul className="space-y-1">
          {probes.map((b) => (
            <li key={b.text} className="text-xs">
              <span className="mr-1">{b.text}</span>
              {b.flags.map((f) => (
                <span key={f} className="bg-muted mr-1 rounded px-1.5 py-0.5 text-[10px]">
                  {FLAG_LABEL[f] ?? f}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
