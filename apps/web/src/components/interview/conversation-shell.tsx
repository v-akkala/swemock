"use client";

import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AiErrorBar, ChatHeader, ChatLog, InterviewBar, LivePacket } from "./parts";
import { useInterview, type InterviewApi } from "./use-interview";
import { useSpeech } from "./use-speech";

export interface ConversationProps {
  sessionId: string;
  roundType: "recruiter" | "behavioral";
  liveVia: "app" | "packet";
  voiceEnabled: boolean;
  /** Recruiter: what the candidate brought to the screen. */
  resume?: { title: string; text: string; role: string; company: string; jobDescription: string };
  /** Behavioral: how many questions this mock has. */
  questionCount?: number;
}

/** Soft limits for one answer (spec §8.5: a 2–3 minute soft timer with a visual indicator). */
const SOFT_MS = 2 * 60_000;
const HARD_MS = 3 * 60_000;

/** A recruiter screen or behavioral interview: chat-first, with the round's own side panel. */
export function ConversationShell(props: ConversationProps) {
  const iv = useInterview(props.sessionId, props.liveVia);
  const packetKind = props.roundType === "recruiter" ? "recruiter-live" : "behavioral-live";
  const phase = iv.state?.phases[iv.state.phaseIndex]?.id;

  return (
    <div className="flex h-full flex-col">
      <InterviewBar iv={iv} />
      <div className="flex min-h-0 flex-1">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Interviewer">
          <ChatHeader iv={iv} />
          {iv.liveVia === "packet" && (
            <LivePacket
              kind={packetKind}
              sessionId={props.sessionId}
              description="Paste this into claude.ai (or any assistant) to run the interview there. This page keeps time. Before you end the round, paste the conversation back so it can be graded."
            />
          )}
          <ChatLog iv={iv} />
          <AiErrorBar iv={iv} />
          {iv.liveVia === "app" && props.roundType === "recruiter" && phase === "fundamentals" && iv.state?.pendingGrade && <SelfGrade iv={iv} questionId={iv.state.pendingGrade} />}
          {iv.liveVia === "app" && <Composer iv={iv} voiceEnabled={props.voiceEnabled} timer={props.roundType === "behavioral" && phase === "questions"} />}
        </section>
        <aside className="border-border hidden w-80 shrink-0 overflow-auto border-l p-4 text-sm lg:block" aria-label="About this round">
          {props.roundType === "recruiter" && props.resume ? <ResumePanel resume={props.resume} /> : <BehavioralPanel iv={iv} count={props.questionCount ?? 0} />}
        </aside>
      </div>
    </div>
  );
}

function SelfGrade({ iv, questionId }: { iv: InterviewApi; questionId: string }) {
  return (
    <div className="border-border shrink-0 space-y-2 border-t bg-emerald-500/5 p-3" data-testid="self-grade">
      <p className="text-sm font-medium">How did your answer compare with those key points?</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-8" onClick={() => void iv.gradeQuestion(questionId, 2)} data-testid="grade-2">
          Got it
        </Button>
        <Button variant="outline" className="h-8" onClick={() => void iv.gradeQuestion(questionId, 1)} data-testid="grade-1">
          Partly
        </Button>
        <Button variant="outline" className="h-8" onClick={() => void iv.gradeQuestion(questionId, 0)} data-testid="grade-0">
          Missed it
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Be honest: your answers set how hard the next question is, and they count toward your fundamentals score.</p>
    </div>
  );
}

function Composer({ iv, voiceEnabled, timer }: { iv: InterviewApi; voiceEnabled: boolean; timer: boolean }) {
  const [voiceUsed, setVoiceUsed] = useState(false);
  const speech = useSpeech(iv.setInput);
  const lastQuestion = [...iv.messages].reverse().find((m) => m.from === "interviewer");

  async function submit() {
    const voice = voiceUsed;
    if (speech.listening) speech.stop();
    const speechMs = speech.takeSpeechMs();
    setVoiceUsed(false);
    await iv.send(voice ? { voice: true, speechMs } : undefined);
  }

  return (
    <form
      className="border-border shrink-0 space-y-2 border-t p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {timer && lastQuestion && <AnswerTimer since={lastQuestion.ts} now={iv.serverNow} />}
      <textarea
        value={iv.input}
        onChange={(e) => iv.setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            void submit();
          }
        }}
        aria-label="Your answer"
        placeholder={speech.listening ? "Listening… speak your answer, then press Send." : "Type your answer. Enter sends, Shift+Enter for a new line."}
        className="bg-card h-28 w-full rounded-md border border-border p-2 text-sm"
        data-testid="chat-input"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-8" data-testid="send">
          Send
        </Button>
        {voiceEnabled && speech.supported && (
          <Button
            type="button"
            variant={speech.listening ? "default" : "outline"}
            className="h-8"
            aria-pressed={speech.listening}
            data-testid="mic"
            onClick={() => {
              if (speech.listening) speech.stop();
              else {
                setVoiceUsed(true);
                speech.start(iv.input);
              }
            }}
          >
            {speech.listening ? "Stop listening" : "Speak"}
          </Button>
        )}
        {voiceEnabled && !speech.supported && <span className="text-muted-foreground text-xs">This browser has no speech recognition; type instead.</span>}
        {speech.error && <span role="alert" className="text-xs text-red-600 dark:text-red-400">{speech.error}</span>}
        {iv.error && <span role="alert" className="text-xs text-red-600 dark:text-red-400">{iv.error}</span>}
      </div>
      {voiceEnabled && speech.supported && (
        <p className="text-muted-foreground text-xs">
          Voice uses your browser&apos;s speech recognition; Chrome and Edge send the audio to Google or Microsoft. swemock never receives audio.
        </p>
      )}
    </form>
  );
}

/** Green until two minutes, amber until three, then red: a nudge to wrap up, never a cutoff. */
function AnswerTimer({ since, now }: { since: number; now: number }) {
  const elapsed = Math.max(0, now - since);
  const state = elapsed < SOFT_MS ? "ok" : elapsed < HARD_MS ? "wrap" : "over";
  const pct = Math.min(100, (elapsed / HARD_MS) * 100);
  const secs = Math.floor(elapsed / 1000);
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="answer-timer" data-state={state}>
      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full" role="progressbar" aria-label="Time on this answer" aria-valuemin={0} aria-valuemax={180} aria-valuenow={Math.min(secs, 180)}>
        <div className={cn("h-full transition-all", state === "ok" && "bg-emerald-500", state === "wrap" && "bg-amber-500", state === "over" && "bg-red-500")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-muted-foreground w-28 text-right tabular-nums">
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} {state === "ok" ? "" : state === "wrap" ? "· start wrapping up" : "· over time"}
      </span>
    </div>
  );
}

function ResumePanel({ resume }: { resume: NonNullable<ConversationProps["resume"]> }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-semibold">Recruiter screen</h2>
        <p className="text-muted-foreground text-xs">
          {resume.role}
          {resume.company ? ` at ${resume.company}` : ""}
        </p>
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-medium">Your resume ({resume.title})</summary>
        <pre className="bg-muted mt-2 max-h-96 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">{resume.text}</pre>
      </details>
      {resume.jobDescription && (
        <details>
          <summary className="cursor-pointer text-xs font-medium">Job description</summary>
          <div className="mt-2 text-xs">
            <Markdown>{resume.jobDescription}</Markdown>
          </div>
        </details>
      )}
      <p className="text-muted-foreground text-xs">
        Answer as you would out loud, in a few sentences. In the fundamentals part, the key points appear after your answer and you grade yourself.
      </p>
    </div>
  );
}

function BehavioralPanel({ iv, count }: { iv: InterviewApi; count: number }) {
  const asked = iv.messages.filter((m) => m.tag === "behavioral").length;
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Behavioral interview</h2>
      <p className="text-xs" data-testid="question-progress">
        {asked > 0 ? `Question ${asked} of ${count}` : `${count} questions to come`}
      </p>
      <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs">
        <li>Pick one real example. Set the scene briefly, then spend most of the time on what you did.</li>
        <li>Say what <em>you</em> did, not only what the team did.</li>
        <li>End with the result, ideally with a number, and what you would change.</li>
        <li>The bar below the chat is a soft timer: about two to three minutes per answer.</li>
      </ul>
    </div>
  );
}
