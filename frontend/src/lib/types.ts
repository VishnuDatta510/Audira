export type Difficulty = "easy" | "medium" | "hard";
export type SectionId = "dsa" | "project" | "fundamentals";
export type VoiceSectionId = Exclude<SectionId, "dsa">;
export type SectionStatus = "not_started" | "in_progress" | "completed" | "skipped";

export type AccountRole = "admin" | "candidate";
export type User = { name: string; email: string; role: AccountRole; token: string };

export type CodeRunner = "judge0" | "local";

export type AppConfig = {
  agent_model: string;
  proctor_warning_limit: number;
  proctor_face_absence_seconds: number;
  proctor_mouth_review_seconds: number;
  code_runner: CodeRunner;
};

export type Language = {
  id: string;
  label: string;
  monaco: string;
  runnable: boolean;
  runner: CodeRunner | null;
};

export type ProblemSummary = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  total_tests: number;
};

export type Problem = ProblemSummary & {
  description: string;
  input_format: string;
  output_format: string;
  constraints: string[];
  hints: string[];
  expected_time: string;
  expected_space: string;
  time_limit_ms: number;
  examples: { input: string; output: string; explanation: string | null }[];
  sample_tests: { index: number; input: string; expected: string }[];
  starter_code: Record<string, string>;
};

export type TestStatus = "accepted" | "wrong_answer" | "runtime_error" | "time_limit_exceeded" | "compile_error";

export type TestResult = {
  index: number;
  hidden: boolean;
  status: TestStatus;
  passed: boolean;
  duration_ms?: number;
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
};

export type JudgeResult = {
  mode: "samples" | "submit";
  language: string;
  runner: string;
  compile_error: string | null;
  passed: number;
  total: number;
  all_passed: boolean;
  results: TestResult[];
};

export type CustomRunResult = {
  mode: "custom";
  language: string;
  runner: string;
  compile_error: string | null;
  status: "finished" | "runtime_error" | "time_limit_exceeded" | "compile_error";
  stdout?: string;
  stderr?: string;
  duration_ms?: number;
};

export type RunResult = JudgeResult | CustomRunResult;

export type DsaEvaluation = {
  score: number;
  tests_passed: number;
  tests_total: number;
  time_complexity: string;
  space_complexity: string;
  complexity_feedback: string;
  code_quality_feedback: string;
  likely_approach: string;
  meets_target_complexity: boolean;
  expected_time_complexity: string;
  expected_space_complexity: string;
  reviewer: "agent" | "heuristic";
  submitted_at: string;
};

export type DsaSubmitResult = Omit<JudgeResult, "mode"> & { evaluation: DsaEvaluation | null };

export type DsaStart = {
  problem_slug: string;
  title: string;
  difficulty: Difficulty;
  duration_minutes: number;
  submitted: boolean;
  ends_in_seconds: number;
  problem: Problem;
  evaluation?: DsaEvaluation;
  language?: string;
};

export type SessionSummary = {
  session_id: string;
  candidate_name: string;
  role: string;
  difficulty: Difficulty;
  dsa_duration_minutes: number;
  sections: Record<SectionId, SectionStatus>;
  active_section: SectionId | null;
  voice_progress: { section: VoiceSectionId; question_number: number; total_questions: number; topic: string } | null;
  dsa: {
    problem_slug: string;
    title: string;
    difficulty: Difficulty;
    duration_minutes: number;
    submitted: boolean;
    language: string | null;
    evaluation: DsaEvaluation | null;
    seconds_left: number;
  } | null;
  warnings: number;
  warning_limit: number;
  disqualified: boolean;
  warnings_log: { type: string; details: string; observed_at?: string }[];
  round_scores: Partial<Record<SectionId | "general", number>>;
  /** Opened from a recruiter's link: scores and the report go to the recruiter, not the candidate. */
  recruiter_session: boolean;
  created_at: string;
};

export type SessionProfile = {
  candidate_name: string;
  role: string;
  job_description: string;
  resume: string;
  preparation_goal: string;
  interview_focus: string;
  difficulty: Difficulty;
  dsa_enabled: boolean;
  dsa_duration_minutes: number;
  project_question_count: number;
  fundamentals_question_count: number;
};

export type AnswerFeedback = {
  score: number | null;
  signal?: string;
  strength: string;
  improvement: string;
  role_relevance?: string;
};

export type ConversationTurn = { question: string; answer: string; topic: string; skipped?: boolean };

export type InterviewerMove = "follow_up" | "probe_mention" | "next_topic" | "wrap_up";

export type VoiceQuestion = {
  section: VoiceSectionId;
  question: string;
  question_number: number;
  total_questions: number;
  topic: string;
  kind: InterviewerMove | "opening";
  history: ConversationTurn[];
};

export type AnswerResult = {
  feedback: AnswerFeedback | null;
  next_question: string | null;
  question_number: number;
  total_questions: number;
  complete: boolean;
  closing: string | null;
  topic: string;
  kind: InterviewerMove;
};

export type SkillLevel = "strong" | "solid" | "developing" | "not_shown";

export type RoundVerdict = {
  skills: { skill: string; level: SkillLevel; rating: number; evidence: string }[];
  summary: string;
  rated_by: "agent" | "answer_average";
};

export type ProctorEvent = { type: string; details: string; observed_at?: string; source?: string };

export type Report = {
  candidate_name: string;
  candidate_email: string;
  role: string;
  /** Set when the attempt came from a published link; the report then belongs to that recruiter. */
  interview_id: string | null;
  started_at: string;
  sections: Record<SectionId, SectionStatus>;
  overall_score: number;
  summary: string;
  section_summaries: Record<string, { answer_count: number; average_score: number; answers: { section: string; question: string; answer: string; skipped?: boolean; feedback: AnswerFeedback; topic?: string; kind?: InterviewerMove | "opening" }[] }>;
  communication_assessment: Record<string, string>;
  strengths: string[];
  gaps: string[];
  follow_up_questions: string[];
  integrity_observations: ProctorEvent[];
  warnings: number;
  disqualified: boolean;
  round_scores: Partial<Record<SectionId | "general", number>>;
  round_verdicts?: Partial<Record<VoiceSectionId, RoundVerdict>>;
  dsa_result: (SessionSummary["dsa"] & { late?: boolean; status?: string; code?: string }) | null;
};

export type InterviewDraft = {
  role: string;
  job_description: string;
  interview_focus: string;
  difficulty: Difficulty;
  dsa_enabled: boolean;
  dsa_duration_minutes: number;
  project_question_count: number;
  fundamentals_question_count: number;
};

export type PublicInterview = Omit<InterviewDraft, "job_description" | "interview_focus"> & {
  token: string;
  job_description: string;
  /** The signed-in candidate's attempt at this link, when they already started one. */
  my_session_id?: string | null;
  /** False when the browser sent a sign-in the server no longer accepts. */
  signed_in?: boolean;
};

export type InterviewDetail = PublicInterview & {
  interview_focus: string;
  summary: string;
  id: string;
  path: string;
  created_at: string;
  attempt_count: number;
  coding_problem: Problem | null;
};

export type AttemptStatus = "joined" | "in_progress" | "finished" | "stopped";

export type Attempt = {
  rank: number;
  session_id: string;
  name: string;
  email: string;
  status: AttemptStatus;
  scores: { dsa: number | null; project: number | null; fundamentals: number | null };
  overall_score: number | null;
  started_at: string | null;
  warnings: number;
};
