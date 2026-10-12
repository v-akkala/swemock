"use client";

export type Interviewer = "ai" | "scripted" | "packet";

/** The three ways to run a round (spec §2.4): the connected model, the built-in script, or another chat. */
export function InterviewerChoice({
  value,
  onChange,
  aiConnected,
  packetDetail,
}: {
  value: Interviewer;
  onChange: (v: Interviewer) => void;
  aiConnected: boolean;
  packetDetail: string;
}) {
  const options: { value: Interviewer; label: string; detail: string; disabled?: boolean }[] = [
    {
      value: "ai",
      label: "AI interviewer",
      detail: aiConnected ? "The configured model runs the interview live." : "Configure a provider in Settings to use this.",
      disabled: !aiConnected,
    },
    { value: "scripted", label: "Scripted interviewer", detail: "No AI: timed phases and authored questions." },
    { value: "packet", label: "In another chat", detail: packetDetail },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Interviewer</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-sm has-[:disabled]:opacity-50">
          <input type="radio" name="interviewer" value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} className="mt-1" />
          <span>
            <span className="block font-medium">{o.label}</span>
            <span className="text-muted-foreground block text-xs">{o.detail}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
