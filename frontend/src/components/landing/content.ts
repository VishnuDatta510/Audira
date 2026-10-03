/** Illustrative interview content for the landing page. None of it is a real candidate. */

export type Speaker = "interviewer" | "candidate";

export type Turn = {
  speaker: Speaker;
  text: string;
  /** Shown above an interviewer turn, using the report's own move names. */
  move?: "Follow-up" | "Picked up from their answer" | "New topic";
  /** A phrase inside a candidate turn that the next question picks up. */
  claim?: string;
};

export const heroExchange: Turn[] = [
  {
    speaker: "interviewer",
    text: "Your résumé says you rebuilt the checkout pricing service. What did you change, and why?",
  },
  {
    speaker: "candidate",
    text: "Pricing hit three services on every request, so I put a read-through cache in front of them. It cut p95 latency by about 40 percent.",
    claim: "cut p95 latency by about 40 percent.",
  },
  {
    speaker: "interviewer",
    move: "Follow-up",
    text: "How did you measure that 40 percent?",
  },
  {
    speaker: "candidate",
    text: "We compared a week of p95 on the checkout dashboard before and after the rollout. Honestly, we didn't control for the traffic dip that same week.",
  },
];

export type FollowUpStep = {
  title: string;
  body: string;
  round: "Project round" | "Fundamentals";
  turns: Turn[];
};

export const followUpSteps: FollowUpStep[] = [
  {
    title: "A vague answer gets “walk me through that.”",
    body: "Hand-waving doesn't earn a score. The interviewer asks for the specific case, the way a person across the table would.",
    round: "Project round",
    turns: [
      { speaker: "interviewer", text: "How did the payment queue handle failures?" },
      { speaker: "candidate", text: "We had retries and stuff. It was pretty robust.", claim: "retries and stuff." },
      { speaker: "interviewer", move: "Follow-up", text: "Walk me through what happened when a payment failed twice in a row." },
    ],
  },
  {
    title: "A claim gets checked.",
    body: "Numbers, ownership, and outcomes on a résumé are asked about directly. A strong answer earns a harder question, not a compliment.",
    round: "Project round",
    turns: [
      { speaker: "interviewer", text: "What was your part in the move to Postgres?" },
      { speaker: "candidate", text: "I led the migration off Mongo for the orders data.", claim: "I led the migration" },
      { speaker: "interviewer", move: "Follow-up", text: "What did you move first, and how did you know it was safe to switch reads over?" },
    ],
  },
  {
    title: "What they mention gets picked up.",
    body: "Something relevant said in passing becomes the next question, so the fundamentals round is about the tools this candidate actually uses.",
    round: "Fundamentals",
    turns: [
      { speaker: "interviewer", text: "Which part of the ingestion pipeline did you build?" },
      { speaker: "candidate", text: "The worker that parses vendor files. I wrote it in Java with a small plugin system.", claim: "in Java with a small plugin system." },
      {
        speaker: "interviewer",
        move: "Picked up from their answer",
        text: "You mentioned Java and plugins. When would you pick composition over inheritance there?",
      },
    ],
  },
  {
    title: "It knows when to stop.",
    body: "Not knowing is allowed. There is at most one simpler angle, then the interviewer moves on. It never repeats a question or drills a lost candidate.",
    round: "Fundamentals",
    turns: [
      { speaker: "candidate", text: "I'm honestly not sure how the kernel schedules threads." },
      { speaker: "interviewer", move: "Follow-up", text: "That's fine. What's the difference between a process and a thread?" },
      { speaker: "candidate", text: "Not sure, to be honest." },
      { speaker: "interviewer", move: "New topic", text: "Let's switch. Walk me through how a request reaches your API." },
    ],
  },
];

export type CodeToken = { text: string; tone?: "kw" | "fn" | "str" | "num" | "cm" };

export const codeLines: CodeToken[][] = [
  [{ text: "import", tone: "kw" }, { text: " sys" }],
  [],
  [{ text: "def", tone: "kw" }, { text: " " }, { text: "longest_unique", tone: "fn" }, { text: "(s: str) -> int:" }],
  [{ text: "    last = {}" }],
  [{ text: "    start = best = " }, { text: "0", tone: "num" }],
  [{ text: "    " }, { text: "for", tone: "kw" }, { text: " i, ch " }, { text: "in", tone: "kw" }, { text: " enumerate(s):" }],
  [{ text: "        " }, { text: "if", tone: "kw" }, { text: " last.get(ch, " }, { text: "-1", tone: "num" }, { text: ") >= start:" }],
  [{ text: "            start = last[ch] + " }, { text: "1", tone: "num" }],
  [{ text: "        last[ch] = i" }],
  [{ text: "        best = max(best, i - start + " }, { text: "1", tone: "num" }, { text: ")" }],
  [{ text: "    " }, { text: "return", tone: "kw" }, { text: " best" }],
  [],
  [{ text: "print", tone: "fn" }, { text: "(longest_unique(sys.stdin.readline().strip()))" }],
];

export const codeSamples = [
  { input: "abcabcbb", output: "3", ms: 38 },
  { input: "bbbbb", output: "1", ms: 35 },
  { input: "pwwkew", output: "3", ms: 36 },
];

export const languages = ["Python", "JavaScript", "TypeScript", "Java", "C++", "Go", "C", "C#", "Rust", "Kotlin", "Ruby", "PHP", "Swift"];

export const observationLog = [
  { at: "00:03:12", what: "Tried to leave full screen, returned in 2 s", counted: "Warning 1 of 5" },
  { at: "00:11:47", what: "Switched tabs for 6 s", counted: "Warning 2 of 5" },
  { at: "00:18:30", what: "Looked down at the keyboard", counted: "Not counted" },
  { at: "00:24:05", what: "Eyes held off the screen for 5 s", counted: "Warning 3 of 5" },
  { at: "00:31:52", what: "Mouth movement during a spoken answer", counted: "Kept for review" },
];

export const sampleScoreboard = [
  { name: "Priya Raman", status: "Finished", coding: 92, projects: 74, fundamentals: 68, overall: 78 },
  { name: "Daniel Okafor", status: "Finished", coding: 76, projects: 86, fundamentals: 79, overall: 80 },
  { name: "Mei Tanaka", status: "In progress", coding: 88, projects: null, fundamentals: null, overall: null },
];
