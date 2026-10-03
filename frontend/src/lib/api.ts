import { currentToken, setUser } from "@/lib/auth";
import { toProctorAck } from "@/lib/proctor/api";
import type {
  AnswerResult,
  AppConfig,
  DsaStart,
  DsaSubmitResult,
  Language,
  Report,
  RunResult,
  SectionId,
  SessionProfile,
  SessionSummary,
  User,
  VoiceQuestion,
  VoiceSectionId,
  AccountRole,
  Attempt,
  InterviewDetail,
  InterviewDraft,
  PublicInterview,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((item) => `${(item.loc ?? []).slice(1).join(".")}: ${item.msg}`).join("; ");
    }
  }
  return fallback;
}

function authHeader(): Record<string, string> {
  const token = currentToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Public API origin. Empty in local dev, so HTTP stays on the Next.js `/api` rewrite. No trailing slash, no `/api` suffix. */
export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

const UNREACHABLE = API_ORIGIN
  ? "The interview server is unreachable."
  : "The interview server is unreachable. Start the FastAPI backend on port 8000.";

function endpoint(path: string): string {
  return API_ORIGIN ? `${API_ORIGIN}/api${path}` : `/api${path}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      ...init,
      headers: isForm ? { ...authHeader(), ...init.headers } : { "Content-Type": "application/json", ...authHeader(), ...init.headers },
    });
  } catch {
    throw new ApiError(UNREACHABLE, 0);
  }
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) {
    // The server no longer knows this token, so stop showing the user as signed in.
    if (response.status === 401 && currentToken()) setUser(null);
    const fallback = response.status >= 500 && !body ? UNREACHABLE : `Request failed (${response.status})`;
    throw new ApiError(messageFrom(body, fallback), response.status);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

async function audioRequest(path: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(endpoint(path), { headers: { Accept: "audio/wav" }, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(UNREACHABLE, 0);
  }
  if (!response.ok) {
    const text = await response.text();
    const body = text ? safeJson(text) : null;
    throw new ApiError(messageFrom(body, `Request failed (${response.status})`), response.status);
  }
  const audio = await response.blob();
  if (!audio.size) throw new ApiError("Question voice came back empty.", response.status);
  return audio;
}

const LISTEN_ORIGIN = API_ORIGIN || "http://127.0.0.1:8000";

export function listenSocketUrl(sessionId: string): string {
  const origin = LISTEN_ORIGIN.replace(/\/$/, "").replace(/^http/i, "ws");
  return `${origin}/api/sessions/${encodeURIComponent(sessionId)}/listen`;
}

export const api = {
  config: () => request<AppConfig>("/config"),
  languages: () => request<Language[]>("/languages"),

  register: (name: string, email: string, password: string, role: AccountRole = "candidate", adminAccessCode = "") =>
    post<User>("/auth/register", { name, email, password, role, admin_access_code: adminAccessCode }),
  login: (email: string, password: string) => post<User>("/auth/login", { email, password }),

  interviews: () => request<InterviewDetail[]>("/admin/interviews"),
  interview: (id: string) => request<InterviewDetail>(`/admin/interviews/${id}`),
  createInterview: (draft: InterviewDraft) => post<InterviewDetail>("/admin/interviews", draft),
  attempts: (id: string) => request<Attempt[]>(`/admin/interviews/${id}/attempts`),
  publicInterview: (token: string) => request<PublicInterview>(`/interviews/${token}`),
  joinInterview: (token: string, resume: string) =>
    post<{ session_id: string }>(`/interviews/${token}/sessions`, { resume }),

  extractDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return post<{ file_name: string; text: string; characters: number }>("/documents/extract", form);
  },

  runProblem: (slug: string, language: string, code: string, customInput?: string) =>
    post<RunResult>(`/problems/${slug}/run`, { language, code, custom_input: customInput ?? null }),

  createSession: (profile: SessionProfile) => post<{ session_id: string }>("/sessions", profile),
  session: (id: string) => request<SessionSummary>(`/sessions/${id}`),
  skipSection: (id: string, section: SectionId) => post<SessionSummary>(`/sessions/${id}/sections/${section}/skip`),
  endEarly: (id: string) => post<SessionSummary>(`/sessions/${id}/end-early`),
  startVoiceSection: (id: string, section: VoiceSectionId) => post<VoiceQuestion>(`/sessions/${id}/section`, { section }),
  questionSpeech: (id: string, signal?: AbortSignal) => audioRequest(`/sessions/${encodeURIComponent(id)}/speech`, signal),
  answer: (id: string, answer: string, skipped = false) =>
    post<AnswerResult>(`/sessions/${id}/answer`, skipped ? { skipped: true } : { answer }),
  transcribe: (id: string, audio: Blob) => {
    const form = new FormData();
    form.append("audio", audio, "answer.webm");
    return post<{ transcript: string }>(`/sessions/${id}/transcribe`, form);
  },
  startDsa: (id: string) => post<DsaStart>(`/sessions/${id}/dsa/start`),
  submitDsa: (id: string, language: string, code: string) => post<DsaSubmitResult>(`/sessions/${id}/dsa/submit`, { language, code }),
  report: (id: string) => request<Report>(`/sessions/${id}/report`),

  proctorEvent: (id: string, eventType: string, details: string) =>
    post<Parameters<typeof toProctorAck>[0]>(`/sessions/${id}/proctor-events`, { event_type: eventType, details }).then(toProctorAck),
  visionObservation: (id: string, observation: Record<string, unknown>) =>
    post<Parameters<typeof toProctorAck>[0]>(`/sessions/${id}/vision-observations`, observation).then(toProctorAck),
};
