import Link from "next/link";
import { resolveAi } from "@/server/ai/config";
import { listCs } from "@/server/content/questions";
import { listResumes } from "@/server/resume/store";
import { RecruiterSetup } from "./recruiter-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recruiter Screen · swemock" };

export default function RecruiterPage() {
  const resumes = listResumes();
  const questions = listCs().filter((q) => q.format === "short").length;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recruiter Screen</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A 28-minute phone screen: a walkthrough of your resume with the questions a recruiter would press on, then rapid-fire CS
          fundamentals ({questions} questions in the bank), then your questions. Past screens are in <Link href="/history" className="underline">History</Link>.
        </p>
      </div>
      <RecruiterSetup initialResumes={resumes} aiConnected={resolveAi().connected} />
    </div>
  );
}
