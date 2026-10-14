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
