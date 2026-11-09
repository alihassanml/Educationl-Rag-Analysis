export type User = { id: string; email: string; is_admin: boolean; created_at: string };

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export type StudyDocument = {
  id: string;
  title: string;
  original_filename: string;
  file_size: number;
  status: DocumentStatus;
  error_message: string | null;
  page_count: number | null;
  created_at: string;
};

export type DocumentList = { items: StudyDocument[]; total: number };

export type Citation = {
  document_id: string;
  document_title: string;
  page_number: number | null;
  chunk_id: string;
};

export type AskResponse = {
  answer: string;
  citations: Citation[];
  insufficient_evidence: boolean;
};

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type QuizSummary = {
  id: string;
  title: string;
  topic: string | null;
  difficulty: Difficulty;
  question_count: number;
  source_documents: string[];
  created_at: string;
  attempt: { score: number; total_questions: number; completed_at: string } | null;
};

export type QuizList = { items: QuizSummary[]; total: number };

export type QuizQuestion = { id: string; position: number; question_text: string; options: string[] };
export type QuizDetail = QuizSummary & { questions: QuizQuestion[] };

export type GenerateQuizInput = {
  topic?: string;
  document_ids?: string[];
  difficulty: Difficulty;
  num_questions: number;
};

export type Recommendation = { action: string; message: string };

export type QuestionResult = {
  question_id: string;
  question_text: string;
  options: string[];
  selected_index: number;
  correct_index: number;
  is_correct: boolean;
  explanation: string;
  sources: { document_title: string; page_number: number | null }[];
};

export type AttemptResult = {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  topic: string | null;
  score: number;
  total_questions: number;
  percent: number;
  completed_at: string;
  results: QuestionResult[];
  topic_status: TopicStatus | null;
  recommendation: Recommendation | null;
};

export type TopicStatus = "insufficient_data" | "needs_revision" | "practicing" | "doing_well";

export type TopicProgress = {
  topic_id: string;
  topic_name: string;
  questions_attempted: number;
  correct_answers: number;
  accuracy_percent: number | null;
  status: TopicStatus;
  recommendation: Recommendation;
  last_practiced_at: string;
};

export type TopicProgressList = {
  items: TopicProgress[];
  rules: { min_attempts: number; needs_revision_below_percent: number; doing_well_from_percent: number };
};

export type Activity = {
  quiz_id: string;
  quiz_title: string;
  topic: string | null;
  score: number;
  total_questions: number;
  percent: number;
  completed_at: string;
};

export type ProgressSummary = {
  documents_total: number;
  documents_ready: number;
  quizzes_completed: number;
  average_score_percent: number | null;
  topics_needing_revision: number;
  needs_revision: TopicProgress[];
  next_step: TopicProgress | null;
  recent_activity: Activity[];
  score_history: Activity[];
  latest_document: { id: string; title: string } | null;
};
