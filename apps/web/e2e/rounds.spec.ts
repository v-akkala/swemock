import { expect, test, type Page } from "@playwright/test";
import {
  BEHAVIORAL_DIMENSIONS,
  RECRUITER_DIMENSIONS,
  RESUME,
  STRONG_ANSWER,
  behavioralQuestions,
  csQuestions,
  gradingReplyFor,
  recordResponses,
  resetData,
  say,
  setProvider,
} from "./helpers";
import { makePdf } from "./make-pdf";

/**
 * M4: Recruiter Screen and Behavioral, with provider "none" (scripted + packets) and with the deterministic
 * fake provider (SWEMOCK_TEST_MODE=1 on the server).
 */

test.beforeAll(async ({ request }) => {
  await resetData(request);
});

async function addResume(page: Page, text = RESUME) {
  await page.goto("/recruiter");
  await page.getByTestId("resume-text").fill(text);
  await page.getByTestId("save-resume").click();
  await expect(page.getByTestId("resume-preview")).toBeVisible();
}

async function startRecruiter(page: Page, interviewer: "Scripted interviewer" | "AI interviewer" | "In another chat") {
  await page.getByTestId("role").selectOption("New grad SWE");
  await page.getByTestId("company").fill("Globex");
  await page.getByLabel(interviewer).check();
  await page.getByTestId("start-recruiter").click();
  await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
  return page.url().split("/").pop()!;
}

async function startBehavioral(page: Page, interviewer: "Scripted interviewer" | "AI interviewer" | "In another chat", count = "4") {
  await page.goto("/behavioral");
  await page.getByTestId("count").selectOption(count);
  await page.getByLabel(interviewer).check();
  await page.getByTestId("start-behavioral").click();
  await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
  return page.url().split("/").pop()!;
}

async function endInterview(page: Page, id: string) {
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("end-interview").click();
  await page.waitForURL(new RegExp(`/debrief/${id}$`));
}

test.describe("resumes", () => {
  test("a PDF is read on the server, versions are kept, and what a recruiter would probe is shown", async ({ page }) => {
    await setProvider(page, "none");
    await page.goto("/recruiter");
    // Not a PDF, whatever it is called.
    await page.getByTestId("resume-pdf").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("plain text, not a pdf") });
    await expect(page.getByTestId("setup-error")).toContainText("doesn't look like a PDF");

    const pdf = makePdf(["Jordan Rivera", "EXPERIENCE", "Acme Cloud - Intern   Jun 2025 - Aug 2025", "- Improved API latency by 40% with a Redis cache in front of the catalog", "SKILLS", "Python, C++"]);
    await page.getByTestId("resume-pdf").setInputFiles({ name: "jordan.pdf", mimeType: "application/pdf", buffer: pdf });
    await expect(page.getByTestId("resume-text")).toHaveValue(/Improved API latency by 40% with a Redis cache/);
    await page.getByTestId("save-resume").click();
    await expect(page.getByTestId("resume-preview")).toContainText("Improved API latency by 40%");
    await expect(page.getByTestId("resume-preview")).toContainText("metric");
    await expect(page.getByText("v1: jordan")).toBeVisible();
    await expect(page.getByText(/from a PDF/)).toBeVisible();

    // A second version goes next to the first; both stay.
    await page.getByTestId("resume-new").check();
    await page.getByTestId("resume-text").fill(RESUME);
    await page.getByTestId("save-resume").click();
    await expect(page.getByText("v2: Resume v2")).toBeVisible();
    await expect(page.getByText("v1: jordan")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("resume-option")).toHaveCount(2);

    // Deleting a version removes only that one.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByTestId("resume-option")).toHaveCount(1);
  });

  test("setup asks for what's missing instead of failing silently", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    await page.goto("/recruiter");
    await page.getByTestId("start-recruiter").click();
    await expect(page.getByTestId("setup-error")).toContainText("Add your resume");
  });
});

test.describe("recruiter screen, scripted (no AI)", () => {
  test("resume deep dives, adaptive fundamentals with self-grading, debrief, grading and resume-feedback packets; no key points leak early", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    const rec = recordResponses(page);
    await addResume(page);
    const id = await startRecruiter(page, "Scripted interviewer");

    const chat = page.getByTestId("chat-log");
    await expect(chat).toContainText("tell me about yourself");
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Your background");

    // The resume phase: deep dives on the bullets with numbers and claims, then motivation and logistics.
    await say(page, "I'm a student who likes systems work and I interned on a cloud team.");
    await expect(chat).toContainText("Tell me more about:");
    await say(page, "I measured it with our dashboards before and after the change.");
    await say(page, "Mostly my own part: I wrote the cache layer.");
    await say(page, "It was a team of three interns and I led it.");
    await expect(chat).toContainText("Why Globex");
    await say(page, "I like the product and the infrastructure problems.");
    await expect(chat).toContainText("logistics");
    await say(page, "I graduate in June, can start in July, and can work from anywhere in the US.");
    await expect(chat).toContainText("timeline");
    await say(page, "I'm interviewing at a few places; offers expected in a month.");

    // Out of resume lines: the screen moves to fundamentals by itself and asks the first (easy) question.
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("CS fundamentals");
    await expect(page.locator('[data-tag="cs"]')).toHaveCount(1);
    await expect(chat).toContainText("Question 1:");

    // Answering reveals the key points; the candidate grades themselves before the next question.
    await say(page, "My attempt at an answer, covering the basics as I understand them.");
    await expect(page.locator('[data-tag="cs-reveal"]')).toHaveCount(1);
    await expect(page.getByTestId("self-grade")).toBeVisible();
    await page.getByTestId("grade-2").click();
    await expect(page.locator('[data-tag="cs"]')).toHaveCount(2);
    await expect(page.getByTestId("self-grade")).toBeHidden();
    await say(page, "I'm not sure about this one at all.");
    await page.getByTestId("grade-0").click();
    await expect(page.locator('[data-tag="cs"]')).toHaveCount(3);

    // Nothing from questions that weren't asked has reached the browser; what was revealed has.
    const chatText = await chat.innerText();
    const bank = csQuestions();
    const asked = bank.filter((q) => chatText.includes(q.prompt.slice(0, 40))).map((q) => q.slug);
    expect(asked.length).toBe(3);
    for (const q of bank) {
      const hit = rec.bodies.findIndex((b) => q.hidden.some((kp) => b.includes(kp.slice(0, 50))));
      if (!asked.includes(q.slug)) expect(hit, `${q.slug} key points leaked before being asked (in ${rec.urls[hit]})`).toBe(-1);
    }
    // Positive control: the first two answers were revealed, the third question is still waiting for its answer.
    const revealedCount = bank.filter((q) => asked.includes(q.slug) && rec.bodies.some((b) => q.hidden.some((kp) => b.includes(kp.slice(0, 50))))).length;
    expect(revealedCount).toBe(2);

    // Move on to the candidate's questions, then end.
    await page.getByTestId("next-phase").click();
    await expect(chat).toContainText("questions for me");
    await say(page, "What does the team work on day to day?");
    await endInterview(page, id);

    // Debrief: fundamentals with the key points, the auto score from the self-grades, and resume feedback.
    await expect(page.getByTestId("fundamentals-review")).toContainText("You: Got it");
    await expect(page.getByTestId("fundamentals-review")).toContainText("You: Missed it");
    await expect(page.getByTestId("fundamentals-review")).toContainText("Key points");
    await expect(page.getByTestId("dim-fundamentals")).toContainText("auto");
    await expect(page.getByTestId("metrics")).toContainText("Self-graded: 1 got it, 0 partly, 1 missed");
    await expect(page.getByTestId("recommendation")).toContainText("Objective metrics only");
    await expect(page.getByTestId("resume-feedback")).toContainText("Improved API latency by 40%");

    // Self checklist uses the recruiter rubric.
    await expect(page.getByTestId("self-checklist")).toContainText("Separated what I did from what the team did");
    await page.locator('[data-item="co-intro"]').check();
    await page.locator('[data-item="rd-own"]').check();
    await page.getByTestId("save-self").click();
    await expect(page.getByTestId("recommendation")).not.toContainText("Objective metrics only");

    // Grading packet: the recruiter rubric, the resume, and the key points; a wrong reply is rejected and kept.
    const grading = page.getByTestId("packet-recruiter-grading");
    await grading.getByTestId("copy-packet").click();
    await grading.getByText("Show the prompt").click();
    const gradingText = await grading.locator("textarea[readonly]").inputValue();
    expect(gradingText).toContain("Dimension ids: communication, resume_depth, motivation, fundamentals");
    expect(gradingText).toContain("Improved API latency by 40%");
    await grading.getByLabel("Paste the reply").fill(gradingReplyFor(["communication"]));
    await grading.getByTestId("save-reply").click();
    await expect(grading.getByTestId("packet-error")).toContainText("missing dimension(s)");
    await grading.getByLabel("Paste the reply").fill(gradingReplyFor(RECRUITER_DIMENSIONS, 4));
    await grading.getByTestId("save-reply").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("Clear answers");

    // Resume feedback via a packet: invented numbers are refused, honest rewrites are shown.
    const fb = page.getByTestId("packet-resume-feedback");
    await fb.getByTestId("copy-packet").click();
    await fb.getByText("Show the prompt").click();
    expect(await fb.locator("textarea[readonly]").inputValue()).toContain("Bullets the recruiter probed");
    const reply = (rewrite: string) =>
      "```json\n" +
      JSON.stringify({
        bullets: [{ original: "Improved API latency by 40%", drew_followup: true, could_back_up: "partly", problem: "No baseline.", rewrite, needs_from_candidate: ["The baseline latency"] }],
        summary: "Lead with your own contribution.",
      }) +
      "\n```";
    await fb.getByLabel("Paste the reply").fill(reply("Cut API latency by 40% to 80 ms with a Redis cache"));
    await fb.getByTestId("save-reply").click();
    await expect(fb.getByTestId("packet-error")).toContainText('"80"');
    await fb.getByLabel("Paste the reply").fill(reply("Cut API latency by 40% by adding a Redis cache in front of the catalog service"));
    await fb.getByTestId("save-reply").click();
    await expect(page.getByTestId("resume-feedback")).toContainText("Lead with your own contribution.");
    await expect(page.getByTestId("resume-feedback")).toContainText("Add before using it: The baseline latency");

    // The rubric and key points were never in a response before the debrief... and the history lists the screen.
    await page.goto("/history");
    await expect(page.getByTestId("history")).toContainText("Recruiter screen: New grad SWE at Globex");

    // Redo starts the same screen again from the debrief.
    await page.goto(`/debrief/${id}`);
    await page.getByTestId("redo").click();
    await page.waitForURL(/\/interview\/[A-Z0-9]+$/);
    expect(page.url()).not.toContain(id);
    await expect(page.getByTestId("chat-log")).toContainText("tell me about yourself");
    await expect(page.getByText("Your resume (Resume v1)")).toBeVisible();
  });
});

test.describe("recruiter screen in another chat", () => {
  test("the live packet carries the resume and the questions but never the key points", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    await addResume(page);
    const id = await startRecruiter(page, "In another chat");
    const panel = page.getByTestId("packet-recruiter-live");
    await panel.getByTestId("copy-packet").click();
    await panel.getByText("Show the prompt").click();
    const live = await panel.locator("textarea[readonly]").inputValue();
    expect(live).toContain("Improved API latency by 40%");
    expect(live).toContain("Globex");
    for (const q of csQuestions()) for (const kp of q.hidden) expect(live).not.toContain(kp);
    expect(await page.request.post("/api/packets", { data: { kind: "recruiter-grading", sessionId: id } }).then((r) => r.status())).toBe(409);
    await panel.getByLabel("Paste the conversation (optional, for grading)").fill("Recruiter: Tell me about yourself.\nMe: I'm a student who interned at Acme.");
    await panel.getByTestId("save-reply").click();
    await expect(panel).toContainText("Reply saved");
    await endInterview(page, id);
    const grading = await (await page.request.post("/api/packets", { data: { kind: "recruiter-grading", sessionId: id } })).json();
    expect(grading.markdown).toContain("I'm a student who interned at Acme.");
  });
});

test.describe("behavioral interview, scripted (no AI)", () => {
  test("questions, signal-driven follow-ups, a soft timer, debrief with signals, grading, and fabrication-safe rewrites; strong-answer signals don't leak early", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    const rec = recordResponses(page);
    const id = await startBehavioral(page, "Scripted interviewer");
    const chat = page.getByTestId("chat-log");
    await expect(chat).toContainText("4 behavioral questions");
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Introductions");

    await say(page, "Ready.");
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Questions");
    await expect(chat).toContainText("Question 1 of 4");
    await expect(page.getByTestId("question-progress")).toContainText("Question 1 of 4");
    await expect(page.getByTestId("answer-timer")).toHaveAttribute("data-state", "ok");

    // No "I" and no number: the interviewer presses on ownership, then on the result.
    await say(page, "The team handled it together and it went fine in the end, nothing dramatic.");
    await expect(chat).toContainText("What did YOU specifically do");
    await say(page, "We split the work and it worked out for everyone involved in the project.");
    await expect(chat).toContainText("measurable result");
    // Follow-ups used up: next question; then a strong answer draws an authored follow-up.
    await say(page, STRONG_ANSWER);
    await expect(chat).toContainText("Question 2 of 4");
    await expect(page.getByTestId("question-progress")).toContainText("Question 2 of 4");
    await say(page, STRONG_ANSWER);
    const lastLine = await page.locator('[data-from="interviewer"]').last().innerText();
    const authored = behavioralQuestions().flatMap((q) => q.followUps);
    expect(authored.some((f) => lastLine.includes(f))).toBe(true);

    // Hidden material for the questions asked stays hidden until the debrief.
    const chatText = await chat.innerText();
    const asked = behavioralQuestions().filter((q) => chatText.includes(q.prompt.slice(0, 40)));
    expect(asked.length).toBe(2);
    const live = rec.bodies.join("\n");
    for (const q of behavioralQuestions()) for (const sig of q.hidden) expect(live, `${q.slug} signal leaked`).not.toContain(sig);

    await page.getByTestId("next-phase").click();
    await expect(chat).toContainText("questions for me");
    await endInterview(page, id);

    // Debrief: objective signals, per-answer chips, what a strong answer contains, and the rubric checklist.
    await expect(page.getByTestId("metrics")).toContainText(/Answers: \d+/);
    await expect(page.getByTestId("dim-ownership")).toContainText("auto");
    await expect(page.getByTestId("dim-impact")).toContainText("auto");
    await expect(page.getByTestId("dim-concision")).toContainText("auto");
    await expect(page.getByTestId("answer-review").getByTestId("signals").first()).toContainText("words");
    await expect(page.getByTestId("answer-review")).toContainText("has a number");
    for (const q of asked) await expect(page.getByTestId("question-review")).toContainText(q.hidden[0]!);
    await expect(page.getByTestId("self-checklist")).toContainText("Chose an example that fits the question");

    const grading = page.getByTestId("packet-behavioral-grading");
    await grading.getByTestId("copy-packet").click();
    await grading.getByLabel("Paste the reply").fill(gradingReplyFor(BEHAVIORAL_DIMENSIONS, 3));
    await grading.getByTestId("save-reply").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("Clear answers");
    await expect(page.getByTestId("recommendation")).toContainText("Lean Hire");

    // Stronger versions: a rewrite that invents a number is refused (and kept for editing).
    const rewrite = page.getByTestId("packet-behavioral-rewrite");
    await rewrite.getByTestId("copy-packet").click();
    await rewrite.getByText("Show the prompt").click();
    const packet = await rewrite.locator("textarea[readonly]").inputValue();
    expect(packet).toContain("cut incidents by 30 percent");
    const reply = (stronger: string) => "```json\n" + JSON.stringify({ answers: [{ question: "Billing migration", stronger_version: stronger, missing_facts: ["How many services it was split into"] }] }) + "\n```";
    await rewrite.getByLabel("Paste the reply").fill(reply("I led the billing migration and cut incidents by 55 percent across 12 teams."));
    await rewrite.getByTestId("save-reply").click();
    await expect(rewrite.getByTestId("packet-error")).toContainText('"55"');
    await expect(rewrite.getByLabel("Paste the reply")).toHaveValue(/55 percent/);
    await rewrite.getByLabel("Paste the reply").fill(reply("I led the migration of our billing service and wrote the cutover plan myself; we shipped in six weeks and I cut incidents by 30 percent."));
    await rewrite.getByTestId("save-reply").click();
    await expect(page.getByTestId("rewrites")).toContainText("cut incidents by 30 percent");
    await expect(page.getByTestId("rewrites")).toContainText("How many services it was split into");
  });

  test("the question bank and lens filters are visible, and a focus competency shapes the questions", async ({ page }) => {
    await setProvider(page, "none");
    await page.goto("/behavioral");
    await expect(page.getByTestId("behavioral-bank")).toContainText("Tell me about yourself");
    await expect(page.getByTestId("behavioral-bank")).toContainText("amazon:");
    await page.getByTestId("focus-failure").check();
    await page.getByTestId("lens").selectOption("amazon");
    await page.getByLabel("Scripted interviewer").check();
    await page.getByTestId("start-behavioral").click();
    await page.waitForURL(/\/interview\//);
    await say(page, "Ready.");
    const firstQuestion = await page.locator('[data-tag="behavioral"]').first().innerText();
    const failureQs = behavioralQuestions().filter((q) => /failure/.test(q.slug) || q.slug === "time-you-were-wrong");
    expect(failureQs.some((q) => firstQuestion.includes(q.prompt.slice(0, 40)))).toBe(true);
  });
});

test.describe("voice input (feature flag)", () => {
  test.beforeEach(async ({ page }) => {
    // A stand-in for the browser's speech recognition, which headless Chromium doesn't have.
    await page.addInitScript(() => {
      class FakeRecognition {
        continuous = false;
        interimResults = false;
        lang = "";
        onresult: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        start() {
          setTimeout(() => {
            const transcript =
              "Um, so basically I led the migration of the billing service, and uh, we cut incidents by 30 percent over six weeks, you know, which was kind of a big deal for the support team and the customers";
            this.onresult?.({ resultIndex: 0, results: [[{ transcript }]] });
          }, 150);
        }
        stop() {
          setTimeout(() => this.onend?.(), 20);
        }
      }
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
        Object.defineProperty(window, name, { value: FakeRecognition, configurable: true, writable: true });
      }
    });
  });

  test("off by default; when on, speaking fills the answer and the debrief shows filler words", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "none");
    let id = await startBehavioral(page, "Scripted interviewer");
    await expect(page.getByTestId("mic")).toHaveCount(0);
    await endInterview(page, id);

    await page.goto("/settings");
    await expect(page.getByText(/never receives audio/)).toBeVisible();
    await page.getByTestId("voice-flag").check();
    await page.reload();
    await expect(page.getByTestId("voice-flag")).toBeChecked();

    id = await startBehavioral(page, "Scripted interviewer");
    await say(page, "Ready.");
    await expect(page.getByTestId("mic")).toBeVisible();
    await page.getByTestId("mic").click();
    await expect(page.getByTestId("chat-input")).toHaveValue(/Um, so basically I led the migration/);
    await page.getByTestId("mic").click();
    await page.getByTestId("send").click();
    await expect(page.locator('[data-from="candidate"]').last()).toContainText("Um, so basically");
    await endInterview(page, id);
    await expect(page.getByTestId("metrics")).toContainText(/Filler words \(voice\): [1-9]/);
    await expect(page.getByTestId("answer-review").getByTestId("signals").first()).toContainText(/\d+ fillers/);
    await page.request.patch("/api/settings", { data: { features: { voiceInput: false, fallibleMode: false } } });
  });
});

test.describe("story bank", () => {
  test("stories are saved, tagged, and shown in a coverage matrix with gaps and over-reliance", async ({ page }) => {
    await resetData(page.request);
    await page.goto("/behavioral/stories");
    await expect(page.getByTestId("story-form")).toBeVisible();
    await page.getByTestId("story-title").fill("Billing outage");
    await page.getByTestId("story-situation").fill("The billing service went down on a Friday.");
    await page.getByTestId("story-action").fill("I rolled back, then wrote the postmortem.");
    await page.getByTestId("story-result").fill("Restored in 20 minutes.");
    await page.getByTestId("story-metrics").fill("20 minutes to restore");
    for (const c of ["failure", "pressure", "ownership", "teamwork"]) await page.getByTestId(`tag-${c}`).check();
    await page.getByTestId("save-story").click();
    await expect(page.getByTestId("story-list")).toContainText("Billing outage");

    const flags = page.getByTestId("coverage-flags");
    await expect(flags).toContainText("No story for:");
    await expect(flags).toContainText("Conflict and disagreement");
    await expect(flags).toContainText("Over-reliance");
    await expect(flags).toContainText("Billing outage");
    await expect(page.getByTestId("row-failure")).toHaveAttribute("data-count", "1");
    await expect(page.getByTestId("row-conflict")).toHaveAttribute("data-count", "0");

    // A second story spreads the load: ownership now has two stories and the warning clears.
    await page.getByTestId("new-story").click();
    await page.getByTestId("story-title").fill("Cache migration");
    for (const c of ["failure", "pressure", "teamwork", "conflict"]) await page.getByTestId(`tag-${c}`).check();
    await page.getByTestId("save-story").click();
    await expect(page.getByTestId("story-list")).toContainText("Cache migration");
    await expect(page.getByTestId("row-failure")).toHaveAttribute("data-count", "2");
    await expect(page.getByTestId("row-conflict")).toHaveAttribute("data-count", "1");
    await expect(flags).not.toContainText("Over-reliance");

    // Edit and delete.
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page.getByTestId("story-title")).toHaveValue(/Billing outage|Cache migration/);
    await page.getByTestId("story-title").fill("Cache migration v2");
    await page.getByTestId("save-story").click();
    await expect(page.getByTestId("story-list")).toContainText("Cache migration v2");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByTestId("story-list").locator("li")).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId("story-list").locator("li")).toHaveCount(1);
    await page.goto("/behavioral");
    await expect(page.getByTestId("stories-link")).toBeVisible();
    await expect(page.getByText("(no story yet)").first()).toBeVisible();
  });
});

test.describe("AI interviewer (fake provider)", () => {
  test("recruiter: streams, blocks a key-point leak, grades, and writes resume feedback", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "fake");
    const rec = recordResponses(page);
    await addResume(page);
    const id = await startRecruiter(page, "AI interviewer");

    await page.getByTestId("chat-input").fill("I'm a student who interned on a cloud team.");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("[fake interviewer]", { timeout: 15_000 });

    await page.getByTestId("chat-input").fill("LEAK_TEST");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("I can't give that part away", { timeout: 15_000 });
    const bodies = rec.bodies.join("\n");
    for (const q of csQuestions()) for (const kp of q.hidden) expect(bodies).not.toContain(kp.slice(0, 50));

    await endInterview(page, id);
    await page.getByTestId("grade-ai").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("[fake]", { timeout: 30_000 });
    await page.getByTestId("ai-resume-feedback").click();
    await expect(page.getByTestId("resume-feedback")).toContainText("[fake] Lead with your own contribution", { timeout: 30_000 });
    await expect(page.getByTestId("resume-feedback")).toContainText("Add before using it");
  });

  test("behavioral: the first reply opens the questions, signals stay hidden, rewrites come from the model", async ({ page }) => {
    await resetData(page.request);
    await setProvider(page, "fake");
    const rec = recordResponses(page);
    const id = await startBehavioral(page, "AI interviewer");
    await page.getByTestId("chat-input").fill("Ready.");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("[fake interviewer]", { timeout: 15_000 });
    await expect(page.getByTestId("phases").locator('[aria-current="step"]')).toHaveText("Questions");

    await page.getByTestId("chat-input").fill(STRONG_ANSWER);
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.locator('[data-from="interviewer"]')).toHaveCount(3, { timeout: 15_000 });

    await page.getByTestId("chat-input").fill("LEAK_TEST");
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("I can't give that part away", { timeout: 15_000 });
    const live = rec.bodies.join("\n");
    for (const q of behavioralQuestions()) for (const sig of q.hidden) expect(live).not.toContain(sig);

    await endInterview(page, id);
    await page.getByTestId("grade-ai").click();
    await expect(page.getByTestId("ai-feedback")).toContainText("[fake]", { timeout: 30_000 });
    await page.getByTestId("ai-behavioral-rewrite").click();
    await expect(page.getByTestId("rewrites")).toContainText("[fake]", { timeout: 30_000 });
    await expect(page.getByTestId("rewrites")).toContainText("cut incidents by 30 percent");
  });
});
