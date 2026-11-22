export type User = { id: string; email: string; is_admin: boolean; created_at: string };

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export type DocumentSource = "pdf" | "website" | "text";

export type StudyDocument = {
  id: string;
  title: string;
  original_filename: string;
  file_size: number;
  status: DocumentStatus;
  error_message: string | null;
  page_count: number | null;
  created_at: string;
  /** Where the material came from. A PDF link is stored as a "pdf". */
  source_type: DocumentSource;
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

export type DayActivity = { date: string; questions: number; quizzes: number };

export type DocumentUsage = {
  id: string;
  title: string;
  source_type: DocumentSource;
  page_count: number | null;
  chunk_count: number;
  times_cited: number;
  pages_cited: number;
  last_cited_at: string | null;
};

export type HotPage = { document_id: string; document_title: string; page_number: number; times_cited: number };

/** How the student uses their material, from chats, citations, quizzes and the library. */
export type StudyInsights = {
  questions_asked: number;
  answers_with_sources: number;
  answers_not_found: number;
  citations_total: number;
  pages_indexed: number;
  chunks_indexed: number;
  helpful_votes: number;
  unhelpful_votes: number;
  active_days: number;
  current_streak: number;
  longest_streak: number;
  /** The student's local date (YYYY-MM-DD), the last day of `activity` */
  today: string;
  /** 26 weeks, oldest first */
  activity: DayActivity[];
  documents: DocumentUsage[];
  hot_pages: HotPage[];
};

export type EvalMode = "dense" | "hybrid";
export type EvalRunStatus = "queued" | "running" | "completed" | "failed";
export type EvalOutcome = "all" | "failed" | "passed";
export type EvalK = "1" | "3" | "5" | "10";
export type EvalPerK = Record<EvalK, number>;

export type EvalConfig = {
  retrieval_mode: EvalMode;
  min_similarity: number;
  depth: number;
  embedding_model: string;
};

export type EvalMetrics = {
  n_answerable: number;
  n_unanswerable: number;
  n_errors: number;
  hit_rate: EvalPerK;
  precision: EvalPerK;
  ndcg: EvalPerK;
  mrr: number;
  ci: { "hit_rate@5": [number, number]; mrr: [number, number] };
  abstention: {
    tp: number;
    fn: number;
    fp: number;
    tn: number;
    precision: number;
    recall: number;
    f1: number;
    accuracy: number;
  };
  pass_rate: number;
  latency_ms: { p50: number; p95: number };
};

export type EvalRun = {
  id: string;
  dataset_id: string;
  dataset_name: string;
  status: EvalRunStatus;
  config: EvalConfig;
  metrics: EvalMetrics | null;
  error_message: string | null;
  items_done: number;
  items_total: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type EvalRunList = { items: EvalRun[]; total: number };

export type EvalDataset = {
  id: string;
  name: string;
  item_count: number;
  answerable_count: number;
  created_at: string;
};

export type EvalDatasetList = { items: EvalDataset[]; total: number };

export type EvalRetrieved = {
  rank: number;
  chunk_id: string;
  document_title: string;
  page_number: number | null;
  similarity: number;
  relevant: boolean;
};

export type EvalResult = {
  id: string;
  question: string;
  answerable: boolean;
  question_type: string;
  concept: string | null;
  gold_document_title: string | null;
  gold_page: number | null;
  answered: boolean | null;
  passed: boolean | null;
  first_relevant_rank: number | null;
  retrieved: EvalRetrieved[];
  latency_ms: number | null;
  error: string | null;
};

export type EvalResultList = { items: EvalResult[]; total: number };

export type EvalCompare = { runs: EvalRun[]; config_diff: Record<string, unknown[]> };

export type StartEvalRunInput = { dataset_id: string; retrieval_mode?: EvalMode; min_similarity?: number };

// --- Tutor chat (docs/UI_REDESIGN.md section 20) ---

export type ThreadSummary = { id: string; title: string; created_at: string; updated_at: string };

export type ChatCitation = {
  marker: number;
  chunk_id: string | null;
  document_id: string | null;
  document_title: string;
  page_number: number | null;
  snippet: string;
  source_deleted: boolean;
};

export type FeedbackRating = "up" | "down";
export type FeedbackReason = "wrong" | "missing_source" | "unclear";

export type ChatMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  standalone_query: string | null;
  rewrite_used: boolean;
  abstained: boolean;
  status: "complete" | "stopped" | "failed";
  created_at: string;
  citations: ChatCitation[];
  feedback: FeedbackRating | null;
};

export type ThreadDetail = ThreadSummary & { messages: ChatMessageDto[] };

export type FeedbackItem = {
  message_id: string;
  rating: FeedbackRating;
  reason: FeedbackReason | null;
  question: string;
  answer: string;
  abstained: boolean;
  created_at: string;
};
