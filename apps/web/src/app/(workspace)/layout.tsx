import type { ReactNode } from "react";

/** Full-window pages (code workspaces): everything below the header. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <div className="h-[calc(100dvh-3rem)] min-h-[560px]">{children}</div>;
}
