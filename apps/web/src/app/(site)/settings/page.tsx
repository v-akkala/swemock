import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db";
import { dataDir } from "@/server/config";
import { readSettings } from "@/server/settings";
import { ContentSection } from "./content-section";
import { JudgeSection } from "./judge-section";
import { SettingsForm } from "./settings-form";
import { FallibleSection } from "./fallible-section";
import { VoiceSection } from "./voice-section";

export const dynamic = "force-dynamic";

function listBackups(): string[] {
  const dir = path.join(dataDir(), "backups");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".db")).sort().reverse() : [];
}

export default function SettingsPage() {
  const settings = readSettings(getDb());
  const backups = listBackups();
  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm initial={settings} />
      <VoiceSection initial={settings} />
      <FallibleSection initial={settings} />
      <JudgeSection />
      <ContentSection />
      <section aria-labelledby="data-heading" className="space-y-2">
        <h2 id="data-heading" className="text-lg font-semibold">
          Data
        </h2>
        <p className="text-muted-foreground text-sm">
          Everything is stored locally in <code className="font-mono">{dataDir()}</code>. The database is backed up
          on every start; the last 10 backups are kept.
        </p>
        <p className="text-sm">
          {backups.length === 0 ? "No backups yet." : `${backups.length} backup(s), newest: ${backups[0]}`}
        </p>
      </section>
    </div>
  );
}
