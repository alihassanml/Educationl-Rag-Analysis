import { apiRequest } from "./api-client";
import type {
  AskResponse,
  AttemptResult,
  DocumentList,
  GenerateQuizInput,
  ProgressSummary,
  QuizDetail,
  QuizList,
  StudyDocument,
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
  remove: (id: string) => apiRequest<void>(`/documents/${id}`, { method: "DELETE" }),
};

export const tutorApi = {
  ask: (question: string, documentIds: string[] | null) =>
    apiRequest<AskResponse>("/tutor/ask", {
      method: "POST",
      json: { question, document_ids: documentIds && documentIds.length > 0 ? documentIds : null },
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
};

export const progressApi = {
  summary: (signal?: AbortSignal) => apiRequest<ProgressSummary>("/progress/summary", { signal }),
  topics: (signal?: AbortSignal) => apiRequest<TopicProgressList>("/progress/topics", { signal }),
};
