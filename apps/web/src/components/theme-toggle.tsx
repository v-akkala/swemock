"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import type { Theme } from "@swemock/shared";
import { Button } from "@/components/ui/button";
import { patchSettings } from "@/lib/api";

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);
  const next: Theme = theme === "dark" ? "light" : "dark";

  async function toggle() {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    await patchSettings({ theme: next });
  }

  return (
    <Button variant="ghost" aria-label={`Switch to ${next} mode`} onClick={toggle} className="px-2">
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}
