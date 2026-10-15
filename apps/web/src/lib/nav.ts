/** Top-level navigation. `milestone` marks sections that are not built yet. */
export interface NavItem {
  href: string;
  label: string;
  description: string;
  milestone?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dsa", label: "DSA", description: "LeetCode-style problems with a real judge." },
  { href: "/recruiter", label: "Recruiter Screen", description: "Resume walkthrough and CS fundamentals." },
  { href: "/behavioral", label: "Behavioral", description: "STAR answers, follow-ups, and a story bank." },
  { href: "/lld", label: "Low-Level Design", description: "Complete the system, or implement the class." },
  { href: "/ai-fluency", label: "AI Fluency", description: "Comprehension, AI code review, feature extension." },
  { href: "/ml", label: "ML", description: "System design, serving, training, fundamentals, applied.", milestone: "M7" },
  { href: "/loops", label: "Mock Loops", description: "Chain rounds into a full loop with a committee packet.", milestone: "M8" },
  { href: "/analytics", label: "Analytics", description: "Score trends and weak spots.", milestone: "M8" },
  { href: "/history", label: "History", description: "Every session with full replay." },
];

export function findNavItem(slug: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === `/${slug}`);
}
