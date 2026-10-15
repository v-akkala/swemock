export interface Phase {
  id: string;
  label: string;
  minutes: number;
}

/** Spec §7.1: intro 2m → clarify 5m → approach 8m → code 25m → test and complexity 5m → questions 5m. */
export const DSA_PHASES: Phase[] = [
  { id: "intro", label: "Introductions", minutes: 2 },
  { id: "clarify", label: "Clarifying questions", minutes: 5 },
  { id: "approach", label: "Approach", minutes: 8 },
  { id: "code", label: "Coding", minutes: 25 },
  { id: "test", label: "Testing and complexity", minutes: 5 },
  { id: "questions", label: "Your questions", minutes: 5 },
];

export const totalMinutes = (phases: Phase[]) => phases.reduce((n, p) => n + p.minutes, 0);

export function phasePlanText(phases: Phase[]): string {
  let at = 0;
  return phases
    .map((p, i) => {
      const line = `${i + 1}. ${p.label}: ${p.minutes} min (minute ${at} to ${at + p.minutes})`;
      at += p.minutes;
      return line;
    })
    .join("\n");
}

/** Recruiter screen (spec §8.1): resume about 10 min, fundamentals about 15, then the candidate's questions. */
export const RECRUITER_PHASES: Phase[] = [
  { id: "resume", label: "Your background", minutes: 10 },
  { id: "fundamentals", label: "CS fundamentals", minutes: 15 },
  { id: "wrapup", label: "Your questions", minutes: 3 },
];

export const BEHAVIORAL_MINUTES_PER_QUESTION = 6;

/** Behavioral (spec §8.5): 4–6 questions, each with an answer of 2–3 minutes plus follow-ups. */
export function behavioralPhases(questions: number): Phase[] {
  return [
    { id: "intro", label: "Introductions", minutes: 2 },
    { id: "questions", label: "Questions", minutes: questions * BEHAVIORAL_MINUTES_PER_QUESTION },
    { id: "wrapup", label: "Your questions", minutes: 3 },
  ];
}

/**
 * Low-level design (spec §8.3): the requirement change arrives at 60% of the time. For 45 minutes:
 * introductions 2, design 8, implement 17 (to minute 27), new requirement 13, wrap-up 5.
 */
export function lldPhases(minutes: number): Phase[] {
  const at = (f: number) => Math.round(minutes * f);
  const design = Math.max(5, Math.round(minutes * 0.18));
  return [
    { id: "intro", label: "Introductions", minutes: 2 },
    { id: "design", label: "Clarify and design", minutes: design },
    { id: "implement", label: "Implementation", minutes: at(0.6) - 2 - design },
    { id: "change", label: "New requirement", minutes: at(0.9) - at(0.6) },
    { id: "wrapup", label: "Follow-ups and questions", minutes: minutes - at(0.9) },
  ];
}

/** AI Fluency rounds (spec §8.4.x): comprehension 5/30/15/10, review 3/27/10, extension 3/7/35/10/5, scaled to the item's length. */
const FLUENCY_PHASES: Record<"comprehension" | "review" | "extension", { id: string; label: string; weight: number }[]> = {
  comprehension: [
    { id: "orientation", label: "Orientation", weight: 5 },
    { id: "hunt", label: "Bug hunt", weight: 30 },
    { id: "design", label: "Design discussion", weight: 15 },
    { id: "wrapup", label: "Improvements and wrap-up", weight: 10 },
  ],
  review: [
    { id: "intro", label: "Introductions", weight: 3 },
    { id: "review", label: "Review", weight: 27 },
    { id: "decision", label: "Decision and wrap-up", weight: 10 },
  ],
  extension: [
    { id: "intro", label: "Introductions", weight: 3 },
    { id: "plan", label: "Plan", weight: 7 },
    { id: "implement", label: "Implementation", weight: 35 },
    { id: "verify", label: "Verification", weight: 10 },
    { id: "wrapup", label: "Wrap-up", weight: 5 },
  ],
};

export function fluencyPhases(type: "comprehension" | "review" | "extension", minutes: number): Phase[] {
  const spec = FLUENCY_PHASES[type];
  const total = spec.reduce((n, p) => n + p.weight, 0);
  let left = minutes;
  return spec.map((p, i) => {
    const m = i === spec.length - 1 ? left : Math.max(1, Math.round((minutes * p.weight) / total));
    left -= m;
    return { id: p.id, label: p.label, minutes: m };
  });
}
