import Link from "next/link";
import { LANGUAGE_LABELS, LANGUAGES } from "@swemock/shared";
import { JudgeError, runnerStatus } from "@/server/judge/client";

export async function JudgeSection() {
  const status = await runnerStatus().catch((e: unknown) => (e instanceof JudgeError ? e.message : "Unknown error"));
  return (
    <section id="judge" aria-labelledby="judge-heading" className="space-y-2">
      <h2 id="judge-heading" className="text-lg font-semibold">
        Judge
      </h2>
      {typeof status === "string" ? (
        <p className="text-sm text-red-600 dark:text-red-400">{status}</p>
      ) : (
        <>
          <p className="text-sm">
            {status.ok ? "Ready." : status.error}{" "}
            <span className="text-muted-foreground">Runner {status.version}.</span>
          </p>
          <ul className="text-sm">
            {LANGUAGES.map((l) => (
              <li key={l}>
                {LANGUAGE_LABELS[l]}: {status.languages[l] ? "installed" : "missing"}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm">
        <Link href="/playground" className="text-primary underline-offset-4 hover:underline">
          Open the judge playground
        </Link>{" "}
        to try the sandbox.
      </p>
    </section>
  );
}
