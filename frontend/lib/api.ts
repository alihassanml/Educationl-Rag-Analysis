import { apiDownload, apiRequest, apiStream } from "./api-client";
import { readSse, type SseEvent } from "./sse";
import type {
  AskResponse,
  AttemptResult,
  DiagnosticStatus,
  DocumentList,
  EvalCompare,
  EvalDatasetList,
  EvalOutcome,
  EvalResultList,
  EvalRun,
  EvalRunList,
  FeedbackItem,
  FeedbackReason,
  FeedbackRating,
  GenerateQuizInput,
  LearningPath,
  ProgressSummary,
  QuizDetail,
  QuizList,
  StartEvalRunInput,
  StudyDocument,
  StudyInsights,
  ThreadDetail,
  ThreadSummary,
  TopicProgressList,
  User,
} from "@/types/api";

export const authApi = {
  register: (email: string, password: string) =>
    apiRequest<User>("/auth/register", { method: "POST", json: { email, password } }),
  login: (email: string, password: string) =>
    apiRequest<User>("/auth/login", { method: "POST", json: { email, password } }),
  logout: () => apiRequest<void>("/auth/logout", { method: "POST" }),
  me: (signal?: AbortSignal) => apiRequest<User>("/auth/me", { signal }),
};

export const documentsApi = {
  list: (signal?: AbortSignal) => apiRequest<DocumentList>("/documents?limit=100", { signal }),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<StudyDocument>("/documents", { method: "POST", formData });
  },
  /** A web page, or a link to a PDF. The server reads it and indexes it like an upload. */
  addLink: (url: string, title?: string) =>
    apiRequest<StudyDocument>("/documents/website", { method: "POST", json: { url, title: title || null } }),
  addText: (title: string, text: string) => apiRequest<StudyDocument>("/documents/text", { method: "POST", json: { title, text } }),
  remove: (id: string) => apiRequest<void>(`/documents/${id}`, { method: "DELETE" }),
};

const scopeOf = (documentIds: string[] | null) => (documentIds && documentIds.length > 0 ? documentIds : null);

export const tutorApi = {
  threads: (signal?: AbortSignal) => apiRequest<ThreadSummary[]>("/tutor/threads?limit=100", { signal }),
  createThread: () => apiRequest<ThreadSummary>("/tutor/threads", { method: "POST", json: {} }),
  thread: (id: string, signal?: AbortSignal) => apiRequest<ThreadDetail>(`/tutor/threads/${id}`, { signal }),
  renameThread: (id: string, title: string) =>
    apiRequest<ThreadSummary>(`/tutor/threads/${id}`, { method: "PATCH", json: { title } }),
  deleteThread: (id: string) => apiRequest<void>(`/tutor/threads/${id}`, { method: "DELETE" }),
  /** Send a question and read the answer as it is written. Aborting the signal is how the student stops it. */
  async streamMessage(
    threadId: string,
    question: string,
    documentIds: string[] | null,
    onEvent: (event: SseEvent) => void,
    signal?: AbortSignal,
    mode: "ask" | "quiz" | "summary" | "simple" = "ask",
  ): Promise<void> {
    const response = await apiStream(
      `/tutor/threads/${threadId}/messages`,
      { question, document_ids: scopeOf(documentIds), mode },
      signal,
    );
    for await (const event of readSse(response.body!)) onEvent(event);
  },
  feedback: (messageId: string, rating: FeedbackRating, reason?: FeedbackReason) =>
    apiRequest<{ message_id: string; rating: FeedbackRating; reason: FeedbackReason | null }>(
      `/tutor/messages/${messageId}/feedback`,
      { method: "POST", json: { rating, reason: reason ?? null } },
    ),
  recentFeedback: (signal?: AbortSignal) => apiRequest<FeedbackItem[]>("/tutor/feedback?limit=50", { signal }),
  ask: (question: string, documentIds: string[] | null) =>
    apiRequest<AskResponse>("/tutor/ask", {
      method: "POST",
      json: { question, document_ids: scopeOf(documentIds) },
    }),
};

export const quizzesApi = {
  list: (signal?: AbortSignal) => apiRequest<QuizList>("/quizzes?limit=100", { signal }),
  get: (id: string, signal?: AbortSignal) => apiRequest<QuizDetail>(`/quizzes/${id}`, { signal }),
  generate: (input: GenerateQuizInput) =>
    apiRequest<QuizDetail>("/quizzes/generate", { method: "POST", json: input }),
  submit: (id: string, answers: { question_id: string; selected_index: number }[]) =>
    apiRequest<AttemptResult>(`/quizzes/${id}/attempts`, { method: "POST", json: { answers } }),
  result: (id: string, signal?: AbortSignal) => apiRequest<AttemptResult>(`/quizzes/${id}/attempt`, { signal }),
  /** Study notes PDF of a finished quiz */
  notesPdf: (id: string) => apiDownload(`/quizzes/${id}/notes.pdf`),
};

export const pathApi = {
  get: (signal?: AbortSignal) => apiRequest<LearningPath>("/learning-path", { signal }),
};

export const diagnosticApi = {
  status: (signal?: AbortSignal) => apiRequest<DiagnosticStatus>("/diagnostic/status", { signal }),
  /** Starts the diagnostic, or returns the one that was started and not finished */
  start: () => apiRequest<QuizDetail>("/diagnostic", { method: "POST" }),
};

export const progressApi = {
  summary: (signal?: AbortSignal) => apiRequest<ProgressSummary>("/progress/summary", { signal }),
  topics: (signal?: AbortSignal) => apiRequest<TopicProgressList>("/progress/topics", { signal }),
  /** Streak, activity and library usage, dated in the browser's time zone */
  insights: (signal?: AbortSignal) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return apiRequest<StudyInsights>(`/progress/insights${tz ? `?tz=${encodeURIComponent(tz)}` : ""}`, { signal });
  },
};

export const evalApi = {
  datasets: (signal?: AbortSignal) => apiRequest<EvalDatasetList>("/eval/datasets", { signal }),
  startRun: (input: StartEvalRunInput) => apiRequest<EvalRun>("/eval/runs", { method: "POST", json: input }),
  runs: (signal?: AbortSignal) => apiRequest<EvalRunList>("/eval/runs?limit=50", { signal }),
  run: (id: string, signal?: AbortSignal) => apiRequest<EvalRun>(`/eval/runs/${id}`, { signal }),
  results: (
    id: string,
    query: { outcome: EvalOutcome; limit: number; offset: number },
    signal?: AbortSignal,
  ) =>
    apiRequest<EvalResultList>(
      `/eval/runs/${id}/results?outcome=${query.outcome}&limit=${query.limit}&offset=${query.offset}`,
      { signal },
    ),
  compare: (ids: string[], signal?: AbortSignal) =>
    apiRequest<EvalCompare>(`/eval/compare?${ids.map((id) => `runs=${id}`).join("&")}`, { signal }),
};
