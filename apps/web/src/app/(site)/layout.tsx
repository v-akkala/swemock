import type { ReactNode } from "react";

/** Standard pages: content centered in a readable column. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
}
