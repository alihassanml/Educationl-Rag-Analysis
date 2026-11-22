import { apiDownload, apiRequest, apiStream } from "./api-client";
import { readSse, type SseEvent } from "./sse";
import type {
  AccountRole,
  ClassDetail,
  ClassInsights,
  ClassSummary,
  AskResponse,
  AttemptResult,
  DiagnosticStatus,
  DocumentMeta,
  ExamPrediction,
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
  Recap,
  QuizDetail,
  QuizList,
  StartEvalRunInput,
  StudyDocument,
  StudyInsights,
  ThreadDetail,
  ThreadSummary,
  TeacherStyleStatus,
  TopicProgressList,
  User,
  BlockedUser,
  ChallengeDetail,
  DueTopic,
  Notification,
  NotificationList,
  PeerMatchCandidate,
  VivaSessionDetail,
  VivaSessionSummary,
} from "@/types/api";

export const authApi = {
  register: (email: string, password: string, displayName: string, role: AccountRole) =>
    apiRequest<User>("/auth/register", { method: "POST", json: { email, password, display_name: displayName, role } }),
  login: (email: string, password: string) =>
    apiRequest<User>("/auth/login", { method: "POST", json: { email, password } }),
  logout: () => apiRequest<void>("/auth/logout", { method: "POST" }),
  me: (signal?: AbortSignal) => apiRequest<User>("/auth/me", { signal }),
  setLighterSteps: (enabled: boolean) => apiRequest<User>("/auth/me/preferences", { method: "PATCH", json: { lighter_steps_enabled: enabled } }),
  setPreferences: (prefs: { lighter_steps_enabled?: boolean; peer_match_opt_in?: boolean; reminders_enabled?: boolean; reminder_hour_utc?: number }) =>
    apiRequest<User>("/auth/me/preferences", { method: "PATCH", json: prefs }),
};

export const documentsApi = {
  list: (signal?: AbortSignal) => apiRequest<DocumentList>("/documents?limit=100", { signal }),
  upload: (file: File, meta?: DocumentMeta) => {
    const formData = new FormData();
    formData.append("file", file);
    if (meta) {
      formData.append("kind", meta.kind);
      if (meta.exam_year) formData.append("exam_year", String(meta.exam_year));
      if (meta.exam_session) formData.append("exam_session", meta.exam_session);
    }
    return apiRequest<StudyDocument>("/documents", { method: "POST", formData });
  },
  /** Change a document's title or kind (a past paper can carry its year and session). */
  update: (id: string, changes: Partial<DocumentMeta> & { title?: string }) =>
    apiRequest<StudyDocument>(`/documents/${id}`, { method: "PATCH", json: changes }),
  /** A web page, or a link to a PDF. The server reads it and indexes it like an upload. */
  addLink: (url: string, title?: string, meta?: DocumentMeta) =>
    apiRequest<StudyDocument>("/documents/website", { method: "POST", json: { url, title: title || null, ...meta } }),
  /** A YouTube lecture, read from its captions. Fails with code "no_transcript" when there are none. */
  addYoutube: (url: string, title?: string, meta?: DocumentMeta) =>
    apiRequest<StudyDocument>("/documents/youtube", { method: "POST", json: { url, title: title || null, ...meta } }),
  addText: (title: string, text: string, meta?: DocumentMeta) =>
    apiRequest<StudyDocument>("/documents/text", { method: "POST", json: { title, text, ...meta } }),
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
    teacherStyle = false,
  ): Promise<void> {
    const response = await apiStream(
      `/tutor/threads/${threadId}/messages`,
      { question, document_ids: scopeOf(documentIds), mode, ...(teacherStyle ? { teacher_style: true } : {}) },
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

export const teacherStyleApi = {
  status: (signal?: AbortSignal) => apiRequest<TeacherStyleStatus>("/teacher-style", { signal }),
  /** Learns the teacher's style from the current teacher material, unless that is already done */
  build: () => apiRequest<TeacherStyleStatus>("/teacher-style/build", { method: "POST" }),
};

export const examApi = {
  get: (signal?: AbortSignal) => apiRequest<ExamPrediction>("/exam-predictor", { signal }),
  /** Reads the past papers that have not been read yet, then returns the prediction */
  analyse: () => apiRequest<ExamPrediction>("/exam-predictor/analyse", { method: "POST" }),
  setPriority: (topicId: string, pinned: boolean) =>
    apiRequest<{ topic_id: string; pinned: boolean }>(`/exam-predictor/topics/${topicId}/priority`, { method: "PUT", json: { pinned } }),
};

export const lightModeApi = {
  recap: (episodeId: string) => apiRequest<Recap>(`/light-mode/${episodeId}/recap`, { method: "POST" }),
  confidenceQuiz: (episodeId: string) => apiRequest<QuizDetail>(`/light-mode/${episodeId}/confidence-quiz`, { method: "POST" }),
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

export const classesApi = {
  list: (signal?: AbortSignal) => apiRequest<ClassSummary[]>("/classes", { signal }),
  get: (id: string, signal?: AbortSignal) => apiRequest<ClassDetail>(`/classes/${id}`, { signal }),
  create: (name: string) => apiRequest<ClassSummary>("/classes", { method: "POST", json: { name } }),
  join: (joinCode: string) => apiRequest<ClassSummary>("/classes/join", { method: "POST", json: { join_code: joinCode } }),
  leave: (id: string) => apiRequest<void>(`/classes/${id}/membership`, { method: "DELETE" }),
  remove: (id: string) => apiRequest<void>(`/classes/${id}`, { method: "DELETE" }),
  removeMember: (id: string, studentId: string) => apiRequest<void>(`/classes/${id}/members/${studentId}`, { method: "DELETE" }),
  share: (id: string, documentId: string) => apiRequest<void>(`/classes/${id}/documents`, { method: "POST", json: { document_id: documentId } }),
  unshare: (id: string, documentId: string) => apiRequest<void>(`/classes/${id}/documents/${documentId}`, { method: "DELETE" }),
};

export const teacherApi = {
  insights: (classId: string, signal?: AbortSignal) => apiRequest<ClassInsights>(`/teacher/classes/${classId}/insights`, { signal }),
};

export const peerMatchApi = {
  matches: (signal?: AbortSignal) => apiRequest<PeerMatchCandidate[]>("/peer-match/matches", { signal }),
  challenges: (signal?: AbortSignal) => apiRequest<ChallengeDetail[]>("/peer-match/challenges", { signal }),
  challenge: (id: string, signal?: AbortSignal) => apiRequest<ChallengeDetail>(`/peer-match/challenges/${id}`, { signal }),
  createChallenge: (opponentId: string, topicName: string, difficulty?: string) =>
    apiRequest<ChallengeDetail>("/peer-match/challenges", {
      method: "POST",
      json: { opponent_id: opponentId, topic_name: topicName, difficulty },
    }),
  accept: (id: string) => apiRequest<ChallengeDetail>(`/peer-match/challenges/${id}/accept`, { method: "POST" }),
  decline: (id: string) => apiRequest<ChallengeDetail>(`/peer-match/challenges/${id}/decline`, { method: "POST" }),
  cancel: (id: string) => apiRequest<ChallengeDetail>(`/peer-match/challenges/${id}/cancel`, { method: "POST" }),
  submit: (id: string, answers: number[], timeSeconds: number) =>
    apiRequest<ChallengeDetail>(`/peer-match/challenges/${id}/submit`, {
      method: "POST",
      json: { answers, time_seconds: timeSeconds },
    }),
  block: (blockedUserId: string, reason?: string) =>
    apiRequest<BlockedUser>("/peer-match/block", {
      method: "POST",
      json: { blocked_user_id: blockedUserId, reason },
    }),
  unblock: (blockedUserId: string) =>
    apiRequest<{ status: string }>(`/peer-match/block/${blockedUserId}`, { method: "DELETE" }),
  blocks: (signal?: AbortSignal) => apiRequest<BlockedUser[]>("/peer-match/blocks", { signal }),
};

export const vivaApi = {
  transcribe: (file: Blob, filename = "audio.webm") => {
    const formData = new FormData();
    formData.append("file", file, filename);
    return apiRequest<{ transcript: string }>("/viva/transcribe", {
      method: "POST",
      formData,
    });
  },
  start: (topic: string) =>
    apiRequest<VivaSessionDetail>("/viva/sessions", {
      method: "POST",
      json: { topic },
    }),
  sessions: (signal?: AbortSignal) => apiRequest<VivaSessionSummary[]>("/viva/sessions", { signal }),
  session: (id: string, signal?: AbortSignal) => apiRequest<VivaSessionDetail>(`/viva/sessions/${id}`, { signal }),
  answer: (id: string, turnIndex: number, answer: string, isFollowUp: boolean) =>
    apiRequest<VivaSessionDetail>(`/viva/sessions/${id}/answer`, {
      method: "POST",
      json: { turn_index: turnIndex, answer, is_follow_up: isFollowUp },
    }),
  tabSwitch: (id: string, count = 1) =>
    apiRequest<{ tab_switch_count: number }>(`/viva/sessions/${id}/tab-switch`, {
      method: "POST",
      json: { count },
    }),
};

export const notificationsApi = {
  list: (signal?: AbortSignal) => apiRequest<NotificationList>("/notifications", { signal }),
  markRead: (id: string) => apiRequest<Notification>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => apiRequest<{ updated: number }>("/notifications/read-all", { method: "POST" }),
};

export const remindersApi = {
  dueTopics: (signal?: AbortSignal) => apiRequest<DueTopic[]>("/reminders/due-topics", { signal }),
  generateSlipTest: (topic: string) =>
    apiRequest<QuizDetail>("/reminders/slip-tests", {
      method: "POST",
      json: { topic },
    }),
};
