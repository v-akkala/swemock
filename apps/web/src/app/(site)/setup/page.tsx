import { getDb } from "@/server/db";
import { readSettings } from "@/server/settings";
import { SetupFlow } from "./setup-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up · swemock" };

export default function SetupPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome to swemock</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Pick how the interviewer and grader should work. You can skip this: without AI you still get timed rounds, a scripted
          interviewer, copy-prompt packets for any chatbot, and self-scoring. Change it any time in Settings.
        </p>
      </div>
      <SetupFlow initial={readSettings(getDb())} />
    </div>
  );
}
