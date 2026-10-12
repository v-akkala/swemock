import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/nav";
import { getDb } from "@/server/db";
import { readSettings } from "@/server/settings";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "swemock",
  description: "Local-first mock interviews for software and ML engineers.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const { theme } = readSettings(getDb());
  return (
    <html lang="en" className={theme === "dark" ? "dark" : ""}>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
          Skip to content
        </a>
        <header className="border-b border-border">
          <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
            <Link href="/" className="mr-4 font-semibold">
              swemock
            </Link>
            <ul className="flex flex-1 flex-wrap items-center gap-1 text-sm">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:bg-muted rounded-md px-2 py-1">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/settings" className="hover:bg-muted rounded-md px-2 py-1 text-sm">
              Settings
            </Link>
            <ThemeToggle initial={theme} />
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
