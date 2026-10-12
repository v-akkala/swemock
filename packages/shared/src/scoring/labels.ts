/** Display labels only. Safe for client bundles: no rubric content (that stays server-side until the debrief). */
export const RECOMMENDATION_LABELS = {
  strong_no_hire: "Strong No Hire",
  lean_no_hire: "Lean No Hire",
  lean_hire: "Lean Hire",
  strong_hire: "Strong Hire",
} as const;
export type RecommendationLabelKey = keyof typeof RECOMMENDATION_LABELS;
