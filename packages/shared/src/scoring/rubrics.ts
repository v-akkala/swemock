/**
 * Interview rubrics. Each dimension is scored 1–4. The checklist items are the "hidden rubric" revealed
 * after a round for self-scoring (spec §7.5); the anchors describe each level for AI graders.
 */
export type ChecklistKind = "must" | "strong" | "red";

export interface ChecklistItem {
  id: string;
  kind: ChecklistKind;
  text: string;
}

export interface RubricDimension {
  id: string;
  label: string;
  description: string;
  /** What a 1, 2, 3, and 4 look like. */
  anchors: [string, string, string, string];
  items: ChecklistItem[];
}

export interface Rubric {
  id: string;
  version: string;
  dimensions: RubricDimension[];
}

export const DSA_INTERVIEW_RUBRIC: Rubric = {
  id: "dsa-interview",
  version: "1",
  dimensions: [
    {
      id: "understanding",
      label: "Understanding and clarification",
      description: "Pins down the problem before solving it: inputs, outputs, constraints, edge cases.",
      anchors: [
        "Starts solving without confirming what is asked; misreads the problem.",
        "Asks a few questions, but misses constraints or edge cases that matter.",
        "Clarifies inputs, outputs, and the main constraints; confirms with an example.",
        "Quickly surfaces every constraint and edge case that matters, and states assumptions explicitly.",
      ],
      items: [
        { id: "u-restate", kind: "must", text: "Restated the problem or confirmed it with a small example" },
        { id: "u-constraints", kind: "must", text: "Asked about input size or constraints" },
        { id: "u-edges", kind: "must", text: "Asked about edge cases (empty input, duplicates, negatives, limits)" },
        { id: "u-assumptions", kind: "strong", text: "Stated assumptions out loud before relying on them" },
        { id: "u-none", kind: "red", text: "Started coding without clarifying anything" },
      ],
    },
    {
      id: "algorithm",
      label: "Algorithm quality",
      description: "Finds an approach with the right complexity and explains why it works.",
      anchors: [
        "No working approach, or only a brute force without recognizing its cost.",
        "A working but clearly suboptimal approach.",
        "The optimal approach, reached with some prompting or detours.",
        "The optimal approach, justified, with alternatives and tradeoffs considered.",
      ],
      items: [
        { id: "a-before", kind: "must", text: "Explained the approach before coding" },
        { id: "a-optimal", kind: "must", text: "Reached the optimal time complexity for this problem" },
        { id: "a-brute", kind: "strong", text: "Started from a simple approach and improved it deliberately" },
        { id: "a-tradeoffs", kind: "strong", text: "Compared at least two approaches and their tradeoffs" },
        { id: "a-stuck", kind: "red", text: "Stayed on a brute force without recognizing it was too slow" },
      ],
    },
    {
      id: "correctness",
      label: "Correctness",
      description: "The code works, including on edge cases.",
      anchors: [
        "Code does not run or fails most cases.",
        "Works on the happy path; fails edge cases.",
        "Correct after a fix or two found by testing.",
        "Correct on the first real attempt, including edge cases.",
      ],
      items: [
        { id: "c-trace", kind: "must", text: "Traced the code by hand on an example before submitting" },
        { id: "c-edges", kind: "must", text: "Handled the edge cases identified earlier" },
        { id: "c-guess", kind: "red", text: "Changed code at random until tests passed" },
      ],
    },
    {
      id: "code_quality",
      label: "Code quality",
      description: "Readable, well-structured code a teammate could maintain.",
      anchors: [
        "Hard to follow: unclear names, tangled control flow.",
        "Works but messy: duplication, magic numbers, long functions.",
        "Clean and readable with minor issues.",
        "Idiomatic, well-named, appropriately decomposed.",
      ],
      items: [
        { id: "q-names", kind: "must", text: "Used descriptive names" },
        { id: "q-dup", kind: "must", text: "Avoided duplicated logic" },
        { id: "q-idiom", kind: "strong", text: "Used the language idiomatically (standard library, clear structure)" },
        { id: "q-dead", kind: "red", text: "Left dead code, debug prints, or commented-out attempts" },
      ],
    },
    {
      id: "complexity",
      label: "Complexity analysis",
      description: "States time and space complexity correctly and can justify it.",
      anchors: [
        "No analysis, or a wrong one.",
        "Time complexity only, or correct but unjustified.",
        "Correct time and space complexity with a brief justification.",
        "Correct and well-justified, including amortized or worst-case subtleties.",
      ],
      items: [
        { id: "x-time", kind: "must", text: "Stated the time complexity correctly" },
        { id: "x-space", kind: "must", text: "Stated the space complexity correctly" },
        { id: "x-why", kind: "strong", text: "Explained why (which loops, which data structure operations)" },
        { id: "x-wrong", kind: "red", text: "Claimed a complexity that was wrong" },
      ],
    },
    {
      id: "testing",
      label: "Testing and edge cases",
      description: "Verifies the code deliberately instead of relying on the judge.",
      anchors: [
        "Submitted without testing.",
        "Ran only the provided samples.",
        "Tested samples plus at least one edge case of their own.",
        "Designed targeted tests (edges, large input) and fixed issues before submitting.",
      ],
      items: [
        { id: "t-samples", kind: "must", text: "Ran the sample tests before submitting" },
        { id: "t-own", kind: "must", text: "Tried at least one input of my own (custom input or a hand trace)" },
        { id: "t-large", kind: "strong", text: "Thought about the largest inputs and performance" },
        { id: "t-blind", kind: "red", text: "Submitted without running anything" },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      description: "Thinks out loud, responds to the interviewer, and keeps them in the loop.",
      anchors: [
        "Silent or hard to follow; ignores the interviewer.",
        "Explains when asked, but long silent stretches.",
        "Narrates key decisions and answers questions clearly.",
        "Clear, concise, collaborative throughout; handles hints and follow-ups well.",
      ],
      items: [
        { id: "m-narrate", kind: "must", text: "Narrated my thinking while coding" },
        { id: "m-followups", kind: "must", text: "Answered the interviewer's follow-up questions" },
        { id: "m-concise", kind: "strong", text: "Kept explanations concise and structured" },
        { id: "m-silent", kind: "red", text: "Went silent for long stretches or ignored the interviewer" },
      ],
    },
  ],
};

/** Spec §8.1: communication, resume ownership and depth, motivation, fundamentals accuracy, and red flags. */
export const RECRUITER_RUBRIC: Rubric = {
  id: "recruiter-screen",
  version: "1",
  dimensions: [
    {
      id: "communication",
      label: "Communication",
      description: "Clear, structured, and appropriately brief answers; listens to the question being asked.",
      anchors: [
        "Rambling or evasive; answers a different question than the one asked.",
        "Understandable but unstructured, too long, or too terse to follow.",
        "Clear and organized; stays on the question; adjusts when the recruiter redirects.",
        "Concise, well-structured, and engaging; makes the recruiter's job easy.",
      ],
      items: [
        { id: "co-intro", kind: "must", text: "Gave a focused 1–2 minute introduction (who I am, what I've done, what I want next)" },
        { id: "co-direct", kind: "must", text: "Answered the question that was asked before adding detail" },
        { id: "co-brief", kind: "strong", text: "Kept answers short enough to leave room for follow-ups" },
        { id: "co-ramble", kind: "red", text: "Rambled, or talked past the question for most of an answer" },
      ],
    },
    {
      id: "resume_depth",
      label: "Resume ownership and depth",
      description: "Can explain their own work in detail: what they did, how, why, and what the result was.",
      anchors: [
        "Cannot explain their own project, or the claims don't hold up under one follow-up.",
        "Describes what the team did, but is vague on their own part or on how results were measured.",
        "Explains their own contribution and the main technical choices; backs up the numbers.",
        "Deep, specific, and honest: contribution, tradeoffs, what went wrong, and how the result was measured.",
      ],
      items: [
        { id: "rd-own", kind: "must", text: "Separated what I did from what the team did" },
        { id: "rd-numbers", kind: "must", text: "Explained how each number or metric on my resume was measured" },
        { id: "rd-why", kind: "strong", text: "Explained why we chose that design or tool, and what the alternatives were" },
        { id: "rd-learn", kind: "strong", text: "Said what I would do differently" },
        { id: "rd-overclaim", kind: "red", text: "Claimed more than I could back up (overclaiming)" },
        { id: "rd-blank", kind: "red", text: "Could not explain a project on my own resume" },
      ],
    },
    {
      id: "motivation",
      label: "Motivation and fit",
      description: "Why this role and company, and whether logistics and expectations line up.",
      anchors: [
        "No reason beyond 'it's a good company'; unprepared for basic logistics.",
        "A generic reason; vague on timeline or what they are looking for.",
        "A specific reason tied to the role and their background; clear on logistics.",
        "Specific, researched, and credible; connects their goals to the role; clear on logistics and next steps.",
      ],
      items: [
        { id: "mo-why", kind: "must", text: "Gave a specific reason for this company and role (not just its size or brand)" },
        { id: "mo-fit", kind: "must", text: "Connected the role to my background and what I want to learn" },
        { id: "mo-logistics", kind: "must", text: "Had clear answers on graduation date, location, and timeline" },
        { id: "mo-questions", kind: "strong", text: "Asked thoughtful questions about the role or team" },
        { id: "mo-generic", kind: "red", text: "Gave an answer that could have been about any company" },
      ],
    },
    {
      id: "fundamentals",
      label: "CS fundamentals accuracy",
      description: "Correct, reasonably complete answers to rapid-fire fundamentals questions.",
      anchors: [
        "Mostly wrong or unable to answer basic questions.",
        "Gets the gist of easy questions; misses key points on the rest.",
        "Accurate on most questions, including the main key points; a few gaps.",
        "Accurate and complete, with correct reasoning on harder questions; says so when unsure.",
      ],
      items: [
        { id: "fu-key", kind: "must", text: "Hit the main key points on most questions" },
        { id: "fu-basics", kind: "must", text: "Got the basics right (Big-O of common operations, process vs thread, TCP vs UDP, ACID)" },
        { id: "fu-hard", kind: "strong", text: "Reasoned correctly through at least one harder question" },
        { id: "fu-honest", kind: "strong", text: "Said so when I wasn't sure instead of guessing confidently" },
        { id: "fu-wrong", kind: "red", text: "Stated something confidently that was wrong" },
      ],
    },
  ],
};

/** Spec §8.5: STAR structure, specificity, ownership, impact, reflection, relevance, concision. */
export const BEHAVIORAL_RUBRIC: Rubric = {
  id: "behavioral",
  version: "1",
  dimensions: [
    {
      id: "structure",
      label: "STAR structure",
      description: "Situation, task, action, and result are all present and easy to follow.",
      anchors: [
        "No recognizable story, or it's a general opinion instead of an example.",
        "A story, but with missing parts (often the result) or jumbled order.",
        "Clear situation, action, and result, in a sensible order.",
        "Tight setup, a clear task, detailed actions, and a concrete result, with no wasted words.",
      ],
      items: [
        { id: "st-context", kind: "must", text: "Set the scene briefly (situation and what I was responsible for)" },
        { id: "st-action", kind: "must", text: "Spent most of the answer on what I did" },
        { id: "st-result", kind: "must", text: "Ended with a clear result" },
        { id: "st-hypo", kind: "red", text: "Answered with what I would do instead of what I did" },
      ],
    },
    {
      id: "specificity",
      label: "Specificity",
      description: "Concrete details: names, systems, dates, constraints, decisions.",
      anchors: [
        "Generalities only ('I usually…', 'we always…').",
        "Some detail, but key decisions and constraints stay vague.",
        "Concrete about the situation, the decision, and the constraints.",
        "Vivid and precise; an interviewer could verify the story with one more question.",
      ],
      items: [
        { id: "sp-concrete", kind: "must", text: "Used one real example with concrete details (system, people involved, timeline)" },
        { id: "sp-decision", kind: "strong", text: "Described the decision points and why I chose what I chose" },
        { id: "sp-vague", kind: "red", text: "Spoke in generalities ('we usually…') instead of one example" },
      ],
    },
    {
      id: "ownership",
      label: "Ownership",
      description: "Makes clear what the candidate personally did, decided, and was accountable for.",
      anchors: [
        "Credits everything to 'we' or others; the candidate's role is unclear.",
        "Some personal actions, but mixes them with the team's.",
        "Clearly says what they did and decided; credits others appropriately.",
        "Takes accountability, including for mistakes; shows initiative beyond the assigned task.",
      ],
      items: [
        { id: "ow-i", kind: "must", text: "Said what I specifically did (I, not only we)" },
        { id: "ow-credit", kind: "strong", text: "Credited teammates where it was due" },
        { id: "ow-blame", kind: "red", text: "Blamed others or circumstances for what went wrong" },
      ],
    },
    {
      id: "impact",
      label: "Impact and metrics",
      description: "Shows the result and its size, with numbers where possible.",
      anchors: [
        "No result stated.",
        "A result, but qualitative and unmeasured.",
        "A clear result with at least one number or concrete outcome.",
        "Measurable impact on users, the team, or the business, with before/after.",
      ],
      items: [
        { id: "im-result", kind: "must", text: "Stated the outcome" },
        { id: "im-number", kind: "must", text: "Gave at least one number or concrete measure" },
        { id: "im-beyond", kind: "strong", text: "Explained why the result mattered beyond my own task" },
      ],
    },
    {
      id: "reflection",
      label: "Reflection",
      description: "Learns from the experience and can say what they would change.",
      anchors: [
        "No reflection, or only defensiveness.",
        "A generic lesson ('communication is important').",
        "A specific lesson and what they would do differently.",
        "Honest, specific insight that changed how they work since, with evidence.",
      ],
      items: [
        { id: "re-differently", kind: "must", text: "Said what I would do differently" },
        { id: "re-learned", kind: "strong", text: "Described how I've applied the lesson since" },
        { id: "re-defensive", kind: "red", text: "Got defensive or claimed there was nothing to improve" },
      ],
    },
    {
      id: "relevance",
      label: "Relevance",
      description: "The story answers the question that was asked and fits the competency being probed.",
      anchors: [
        "Answers a different question.",
        "Loosely related; the interviewer has to dig for the point.",
        "Directly answers the question with a fitting example.",
        "An ideal example for the competency, with the right scope for the role.",
      ],
      items: [
        { id: "rl-fit", kind: "must", text: "Chose an example that fits the question" },
        { id: "rl-scope", kind: "strong", text: "Picked an example with meaningful scope and stakes" },
        { id: "rl-off", kind: "red", text: "Told a story that didn't answer the question" },
      ],
    },
    {
      id: "concision",
      label: "Concision",
      description: "Answers in about two to three minutes without losing the thread.",
      anchors: [
        "Rambles for far too long, or answers in a sentence.",
        "Noticeably too long or too short; wanders.",
        "Within about two to three minutes; mostly focused.",
        "Tight and well-paced; leaves room for follow-up questions.",
      ],
      items: [
        { id: "cn-time", kind: "must", text: "Kept each answer to roughly two to three minutes" },
        { id: "cn-focus", kind: "strong", text: "Stayed on the main thread without tangents" },
        { id: "cn-ramble", kind: "red", text: "Needed to be cut off or redirected" },
      ],
    },
  ],
};

/** Spec §8.3: tests passed (auto), then a design review of six aspects, plus communication. */
export const LLD_RUBRIC: Rubric = {
  id: "lld-interview",
  version: "1",
  dimensions: [
    {
      id: "correctness",
      label: "Working code (tests)",
      description: "The implementation passes the hidden core, edge, and extension tests.",
      anchors: [
        "Does not build, or fails most core tests.",
        "Core behavior works but edge cases or the new requirement fail.",
        "Core and edge tests pass; the new requirement mostly works.",
        "Everything passes, including the requirement change, with little rework.",
      ],
      items: [
        { id: "k-run", kind: "must", text: "Ran the tests regularly and read the failures before changing code" },
        { id: "k-edges", kind: "must", text: "Handled the edge cases the spec implies (empty state, invalid input, conflicts)" },
        { id: "k-guess", kind: "red", text: "Changed code at random until tests passed" },
      ],
    },
    {
      id: "separation",
      label: "Separation of concerns",
      description: "Each class or module has one clear responsibility, and the pieces interact through small interfaces.",
      anchors: [
        "One large class (or script) does everything.",
        "Some structure, but responsibilities are mixed or leak across classes.",
        "Clear responsibilities with sensible boundaries.",
        "Cohesive, loosely coupled pieces; the boundaries match what is likely to change.",
      ],
      items: [
        { id: "s-split", kind: "must", text: "Split the problem into classes with one clear job each" },
        { id: "s-iface", kind: "strong", text: "Kept interfaces between the pieces small" },
        { id: "s-god", kind: "red", text: "Put most of the logic in one class" },
      ],
    },
    {
      id: "patterns",
      label: "Patterns without over-engineering",
      description: "Uses a pattern where it earns its place and keeps simple things simple.",
      anchors: [
        "No structure where it is needed, or patterns bolted on for show.",
        "A pattern is used, but without a reason or with needless layers.",
        "Patterns appear where they help, and each can be justified.",
        "A minimal design with exactly the abstractions the problem needs, and the tradeoffs explained.",
      ],
      items: [
        { id: "p-justify", kind: "must", text: "Could say why each abstraction exists" },
        { id: "p-simple", kind: "strong", text: "Left simple things simple" },
        { id: "p-over", kind: "red", text: "Added layers, factories, or interfaces with only one use" },
      ],
    },
    {
      id: "naming",
      label: "Naming and encapsulation",
      description: "Names say what things are; internals are hidden behind a clear public API.",
      anchors: [
        "Unclear names; state is public and mutated from outside.",
        "Mixed naming, some internals exposed.",
        "Clear names and a tidy public API.",
        "Precise names, minimal public surface, invariants protected inside the class.",
      ],
      items: [
        { id: "n-names", kind: "must", text: "Used names that say what things are and do" },
        { id: "n-private", kind: "must", text: "Kept internal state private and exposed only what the spec needs" },
        { id: "n-invariant", kind: "strong", text: "Enforced invariants in one place" },
      ],
    },
    {
      id: "errors_extensibility",
      label: "Error handling and extensibility",
      description: "Failures are handled deliberately, and the design absorbs the new requirement.",
      anchors: [
        "Errors ignored or swallowed; the change needs a rewrite.",
        "Some validation; the change touches many places.",
        "Clear, consistent errors; the change fits with modest edits.",
        "Errors are part of the design; the change touches one place or adds a new piece.",
      ],
      items: [
        { id: "e-errors", kind: "must", text: "Validated input and raised clear, consistent errors" },
        { id: "e-change", kind: "must", text: "Added the new requirement without rewriting working code" },
        { id: "e-swallow", kind: "red", text: "Swallowed exceptions or returned silent defaults for invalid use" },
      ],
    },
    {
      id: "complexity",
      label: "Complexity of key operations",
      description: "Chooses data structures that make the important operations efficient, and can say what they cost.",
      anchors: [
        "Operations are needlessly slow, or the cost isn't understood.",
        "Correct but with avoidable linear scans on hot paths.",
        "Appropriate structures; can state the cost of the main operations.",
        "Structures chosen deliberately for the access pattern; tradeoffs and alternatives explained.",
      ],
      items: [
        { id: "x-struct", kind: "must", text: "Chose data structures that fit the main operations" },
        { id: "x-cost", kind: "must", text: "Stated the time complexity of the key operations" },
        { id: "x-scan", kind: "red", text: "Scanned everything on an operation that is called often" },
      ],
    },
    {
      id: "conventions",
      label: "Consistency with the provided code",
      description: "Follows the conventions of the given file and uses it instead of working around it.",
      anchors: [
        "Ignores or rewrites the provided code.",
        "Uses the provided code but with a different style or duplicated logic.",
        "Follows the provided conventions and reuses its pieces.",
        "Extends the provided code naturally and leaves it untouched unless there is a clear reason.",
      ],
      items: [
        { id: "v-reuse", kind: "must", text: "Reused the provided models and helpers instead of duplicating them" },
        { id: "v-style", kind: "must", text: "Matched its naming and error conventions" },
        { id: "v-edit", kind: "red", text: "Rewrote or heavily edited the provided file without a reason" },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      description: "Explains design decisions, asks about requirements, and responds to the interviewer.",
      anchors: [
        "Silent or hard to follow.",
        "Explains when asked, but long silent stretches.",
        "Narrates key decisions and answers questions clearly.",
        "Clear and collaborative; states assumptions, tradeoffs, and what they would do next.",
      ],
      items: [
        { id: "m-clarify", kind: "must", text: "Asked clarifying questions before designing" },
        { id: "m-narrate", kind: "must", text: "Explained design decisions as I made them" },
        { id: "m-tradeoffs", kind: "strong", text: "Discussed alternatives and tradeoffs" },
        { id: "m-silent", kind: "red", text: "Went silent for long stretches or ignored the interviewer" },
      ],
    },
  ],
};

export const COMPREHENSION_RUBRIC: Rubric = {
  id: "comprehension-interview",
  version: "1",
  dimensions: [
    {
      id: "summary",
      label: "Summary of the system",
      description: "Explains what the system does, its main pieces, and how they interact.",
      anchors: [
        "No summary, or it misdescribes the system.",
        "Lists files or functions without the big picture.",
        "Accurate: purpose, main pieces, and data flow.",
        "Accurate and insightful: purpose, flow, invariants, and where it is fragile.",
      ],
      items: [
        { id: "su-purpose", kind: "must", text: "Stated the system's purpose in a sentence" },
        { id: "su-flow", kind: "must", text: "Described how the main pieces interact" },
        { id: "su-fragile", kind: "strong", text: "Pointed out where the design is fragile" },
        { id: "su-wrong", kind: "red", text: "Described something the code doesn't do" },
      ],
    },
    {
      id: "bug_recall",
      label: "Bug recall (auto)",
      description: "How many of the planted bugs were found, weighted by severity.",
      anchors: [
        "Found few or none.",
        "Found some of the easier bugs.",
        "Found most, including some subtle ones.",
        "Found nearly all, subtle ones included.",
      ],
      items: [
        { id: "br-read", kind: "must", text: "Read every file before concluding" },
        { id: "br-test", kind: "strong", text: "Proved at least one suspicion by running a test" },
      ],
    },
    {
      id: "precision",
      label: "Precision (auto)",
      description: "Findings are real problems, not noise.",
      anchors: [
        "Mostly false alarms.",
        "Several unfounded findings.",
        "Almost all findings are real.",
        "Every finding is real, with the right category.",
      ],
      items: [
        { id: "pr-check", kind: "must", text: "Checked a suspicion before reporting it" },
        { id: "pr-noise", kind: "red", text: "Reported style preferences as bugs" },
      ],
    },
    {
      id: "severity",
      label: "Severity calibration (auto)",
      description: "Rates how serious each finding is the way a maintainer would.",
      anchors: [
        "Severity is unrelated to impact.",
        "Often too high or too low.",
        "Mostly in line.",
        "Consistently well calibrated.",
      ],
      items: [
        { id: "sv-impact", kind: "must", text: "Rated severity by impact and likelihood" },
      ],
    },
    {
      id: "design",
      label: "Design reasoning",
      description: "Discusses the debatable design decisions with arguments on both sides.",
      anchors: [
        "No design discussion.",
        "Opinions without reasons.",
        "Weighs tradeoffs on the main decisions.",
        "Weighs tradeoffs, links them to scale and change, and proposes concrete improvements.",
      ],
      items: [
        { id: "de-both", kind: "must", text: "Gave arguments for and against at least one decision" },
        { id: "de-scale", kind: "strong", text: "Said what breaks at 100x scale" },
        { id: "de-improve", kind: "strong", text: "Proposed a concrete improvement" },
      ],
    },
    {
      id: "ai_use",
      label: "Quality of AI use (auto)",
      description: "Uses the assistant as a tool and verifies what it says.",
      anchors: [
        "Pasted assistant output without checking it.",
        "Used the assistant but rarely verified.",
        "Verified most claims by running code or reading.",
        "Used the assistant for leverage and independently verified its claims.",
      ],
      items: [
        { id: "ai-verify", kind: "must", text: "Checked the assistant's claims by running code or reading the code" },
        { id: "ai-reject", kind: "strong", text: "Rejected or corrected something the assistant proposed" },
        { id: "ai-blind", kind: "red", text: "Applied assistant code without reading it" },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      description: "Explains what they see, what they're doing, and why; responds to the interviewer.",
      anchors: [
        "Silent or hard to follow.",
        "Explains when asked, with long silent stretches.",
        "Narrates key decisions and answers questions clearly.",
        "Clear and collaborative throughout; states assumptions and next steps.",
      ],
      items: [
        { id: "cm-narrate", kind: "must", text: "Narrated what I was looking at and why" },
        { id: "cm-questions", kind: "must", text: "Answered the interviewer's questions directly" },
        { id: "cm-silent", kind: "red", text: "Went silent for long stretches or ignored the interviewer" },
      ],
    },
  ],
};

export const REVIEW_RUBRIC: Rubric = {
  id: "review-interview",
  version: "1",
  dimensions: [
    {
      id: "decision",
      label: "Final decision (auto)",
      description: "Approves, requests changes, or rejects as the change deserves.",
      anchors: [
        "The opposite of the right call.",
        "Close, but too harsh or too lenient.",
        "The right call with a thin justification.",
        "The right call with a clear, proportionate summary.",
      ],
      items: [
        { id: "dc-summary", kind: "must", text: "Summarized the reason for the decision" },
      ],
    },
    {
      id: "recall",
      label: "Issues found (auto)",
      description: "How many of the seeded issues were found, weighted by severity.",
      anchors: [
        "Found few or none.",
        "Found the obvious ones.",
        "Found most, including security or edge cases.",
        "Found nearly all.",
      ],
      items: [
        { id: "rc-read", kind: "must", text: "Read the diff and the surrounding code, not just the description" },
        { id: "rc-run", kind: "strong", text: "Ran the tests or wrote one to confirm a suspicion" },
      ],
    },
    {
      id: "precision",
      label: "Precision (auto)",
      description: "Comments point at real problems; a correct change isn't over-flagged.",
      anchors: [
        "Mostly false alarms.",
        "Several unfounded comments.",
        "Almost all comments are real.",
        "Every comment is real and in the right place.",
      ],
      items: [
        { id: "pc-nits", kind: "must", text: "Kept nits separate from blocking issues" },
        { id: "pc-over", kind: "red", text: "Blocked a correct change over preferences" },
      ],
    },
    {
      id: "comments",
      label: "Comment quality",
      description: "Comments are specific, actionable, and professional.",
      anchors: [
        "Vague or rude.",
        "Points at the problem without a way forward.",
        "Specific and polite.",
        "Specific, actionable, with a suggested fix and the reason it matters.",
      ],
      items: [
        { id: "cq-specific", kind: "must", text: "Said what is wrong, where, and why" },
        { id: "cq-fix", kind: "strong", text: "Suggested a fix" },
        { id: "cq-tone", kind: "must", text: "Kept the tone professional" },
      ],
    },
    {
      id: "fix",
      label: "Fix (auto)",
      description: "If a fix was attempted, how many of the hidden tests it passes.",
      anchors: [
        "The fix broke things.",
        "Fixed part of the problem.",
        "Fixed the problem.",
        "Fixed the problem cleanly and added a test.",
      ],
      items: [
        { id: "fx-test", kind: "strong", text: "Added or ran a test for the fix" },
        { id: "fx-small", kind: "must", text: "Kept the fix small and focused" },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      description: "Explains what they see, what they're doing, and why; responds to the interviewer.",
      anchors: [
        "Silent or hard to follow.",
        "Explains when asked, with long silent stretches.",
        "Narrates key decisions and answers questions clearly.",
        "Clear and collaborative throughout; states assumptions and next steps.",
      ],
      items: [
        { id: "cm-narrate", kind: "must", text: "Narrated what I was looking at and why" },
        { id: "cm-questions", kind: "must", text: "Answered the interviewer's questions directly" },
        { id: "cm-silent", kind: "red", text: "Went silent for long stretches or ignored the interviewer" },
      ],
    },
  ],
};

export const EXTENSION_RUBRIC: Rubric = {
  id: "extension-interview",
  version: "1",
  dimensions: [
    {
      id: "acceptance",
      label: "Acceptance tests (auto)",
      description: "The hidden acceptance tests for the ticket pass.",
      anchors: [
        "Few or none pass.",
        "Some pass; core behavior is missing.",
        "Most pass.",
        "All pass.",
      ],
      items: [
        { id: "ac-read", kind: "must", text: "Read the ticket's acceptance criteria before coding" },
      ],
    },
    {
      id: "regression",
      label: "No regressions (auto)",
      description: "The existing behavior still works.",
      anchors: [
        "Broke several existing tests.",
        "Broke a few existing tests.",
        "Nothing broken except edge cases.",
        "No regressions.",
      ],
      items: [
        { id: "rg-run", kind: "must", text: "Ran the existing tests before and after the change" },
      ],
    },
    {
      id: "verification",
      label: "Verification (auto)",
      description: "Checks assistant-written code: runs tests after applying it, reviews diffs, adds tests.",
      anchors: [
        "Applied code without running anything.",
        "Ran tests occasionally.",
        "Ran tests after most changes and reviewed diffs.",
        "Reviewed diffs, ran tests after each change, added tests, and caught problems.",
      ],
      items: [
        { id: "vf-run", kind: "must", text: "Ran the tests after applying assistant code" },
        { id: "vf-diff", kind: "must", text: "Reviewed the diff before accepting it" },
        { id: "vf-test", kind: "strong", text: "Added a test for the new behavior" },
      ],
    },
    {
      id: "time",
      label: "Time management (auto)",
      description: "Gets to a working solution with time left to verify.",
      anchors: [
        "Never got to a working solution.",
        "Finished at the last minute.",
        "Finished with some time to verify.",
        "Finished early and used the rest to verify and clean up.",
      ],
      items: [
        { id: "tm-plan", kind: "must", text: "Made a plan before starting" },
      ],
    },
    {
      id: "fit",
      label: "Structural fit",
      description: "Follows the repository's patterns and CONVENTIONS.md, with no duplication and sensible placement.",
      anchors: [
        "Ignores the conventions and duplicates code.",
        "Works but puts code in the wrong place or breaks a convention.",
        "Follows the layering and naming conventions.",
        "Indistinguishable from the existing code, and reuses what is there.",
      ],
      items: [
        { id: "ft-layer", kind: "must", text: "Put each change in the layer where the conventions say it belongs" },
        { id: "ft-naming", kind: "must", text: "Followed the naming and error-handling conventions" },
        { id: "ft-dup", kind: "red", text: "Duplicated existing logic" },
      ],
    },
    {
      id: "prompting",
      label: "Prompting quality",
      description: "Gives the assistant clear specs, relevant context, and iterates.",
      anchors: [
        "Vague one-line requests.",
        "Some context, little iteration.",
        "Clear requests with the relevant files attached.",
        "Decomposed the task, attached the right context, and iterated on the results.",
      ],
      items: [
        { id: "pm-context", kind: "must", text: "Attached the relevant files or selections" },
        { id: "pm-decompose", kind: "strong", text: "Broke the task into steps" },
        { id: "pm-iterate", kind: "strong", text: "Followed up when the first answer was wrong" },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      description: "Explains what they see, what they're doing, and why; responds to the interviewer.",
      anchors: [
        "Silent or hard to follow.",
        "Explains when asked, with long silent stretches.",
        "Narrates key decisions and answers questions clearly.",
        "Clear and collaborative throughout; states assumptions and next steps.",
      ],
      items: [
        { id: "cm-narrate", kind: "must", text: "Narrated what I was looking at and why" },
        { id: "cm-questions", kind: "must", text: "Answered the interviewer's questions directly" },
        { id: "cm-silent", kind: "red", text: "Went silent for long stretches or ignored the interviewer" },
      ],
    },
  ],
};

export const RUBRICS: Record<string, Rubric> = {
  [LLD_RUBRIC.id]: LLD_RUBRIC,
  [COMPREHENSION_RUBRIC.id]: COMPREHENSION_RUBRIC,
  [REVIEW_RUBRIC.id]: REVIEW_RUBRIC,
  [EXTENSION_RUBRIC.id]: EXTENSION_RUBRIC,
  [DSA_INTERVIEW_RUBRIC.id]: DSA_INTERVIEW_RUBRIC,
  [RECRUITER_RUBRIC.id]: RECRUITER_RUBRIC,
  [BEHAVIORAL_RUBRIC.id]: BEHAVIORAL_RUBRIC,
};

/** The rubric for a round type (`sessions.round_type`). */
export function rubricForRound(roundType: string): Rubric {
  switch (roundType) {
    case "recruiter":
      return RECRUITER_RUBRIC;
    case "behavioral":
      return BEHAVIORAL_RUBRIC;
    case "lld":
      return LLD_RUBRIC;
    case "comprehension":
      return COMPREHENSION_RUBRIC;
    case "review":
      return REVIEW_RUBRIC;
    case "extension":
      return EXTENSION_RUBRIC;
    default:
      return DSA_INTERVIEW_RUBRIC;
  }
}
