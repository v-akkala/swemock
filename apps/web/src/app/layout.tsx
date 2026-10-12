import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/nav";
import { getDb } from "@/server/db";
import { readSettings } from "@/server/settings";
import { CommandPalette, type PaletteItem } from "@/components/command-palette";
import { RunnerStatus } from "@/components/runner-status";
import { listDsa } from "@/server/content/repo";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "swemock",
  description: "Local-first mock interviews for software and ML engineers.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const { theme } = readSettings(getDb());
  const palette: PaletteItem[] = [
    ...NAV_ITEMS.map((n) => ({ label: n.label, href: n.href, group: "Page" })),
    { label: "Settings", href: "/settings", group: "Page" },
    { label: "Judge playground", href: "/playground", group: "Page" },
    { label: "Content review", href: "/content-review", group: "Page" },
    { label: "Online assessment", href: "/dsa/oa", group: "DSA" },
    ...listDsa().map((p) => ({ label: p.title, href: `/dsa/${p.slug}`, group: `${p.difficulty} · ${p.tags[0]}` })),
  ];
  return (
    <html lang="en" className={theme === "dark" ? "dark" : ""}>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
          Skip to content
        </a>
        <header className="border-b border-border">
          <nav aria-label="Main" className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4">
            <Link href="/" className="mr-4 font-semibold">
              swemock
            </Link>
            <ul className="flex flex-1 items-center gap-1 overflow-x-auto text-sm whitespace-nowrap">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:bg-muted rounded-md px-2 py-1">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <RunnerStatus />
            <Link href="/settings" className="hover:bg-muted rounded-md px-2 py-1 text-sm">
              Settings
            </Link>
            <ThemeToggle initial={theme} />
          </nav>
        </header>
        <main id="main">{children}</main>
        <CommandPalette items={palette} />
      </body>
    </html>
  );
}
