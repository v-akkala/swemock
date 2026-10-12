"use client";

import { useRouter } from "next/navigation";
import type { Settings } from "@swemock/shared";
import { AiSettings } from "@/components/ai/ai-settings";
import { Button } from "@/components/ui/button";
import { patchSettings } from "@/lib/api";

export function SetupFlow({ initial }: { initial: Settings }) {
  const router = useRouter();
  async function finish(skip: boolean) {
    await patchSettings(skip ? { provider: "none", onboardingDone: true } : { onboardingDone: true });
    router.push("/");
    router.refresh();
  }
  return (
    <div className="space-y-6">
      <AiSettings initial={initial} />
      <div className="flex gap-3 border-t border-border pt-4">
        <Button onClick={() => void finish(false)} data-testid="setup-done">
          Continue
        </Button>
        <Button variant="ghost" onClick={() => void finish(true)} data-testid="setup-skip">
          Skip: use without AI
        </Button>
      </div>
    </div>
  );
}
