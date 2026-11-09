import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressView } from "@/components/progress/progress-view";
import { TopicRow } from "@/components/progress/topic-row";
import { progressApi } from "@/lib/api";
import type { TopicProgress } from "@/types/api";

vi.mock("@/lib/api", () => ({ progressApi: { topics: vi.fn(), summary: vi.fn() } }));
vi.mock("@/components/progress/score-chart", () => ({ ScoreChart: () => <div>chart</div>, MIN_POINTS_FOR_CHART: 3 }));

const rules = { min_attempts: 3, needs_revision_below_percent: 60, doing_well_from_percent: 80 };
const topic: TopicProgress = {
  topic_id: "t1", topic_name: "Recursion", questions_attempted: 5, correct_answers: 2, accuracy_percent: 40,
  status: "needs_revision", last_practiced_at: "2026-01-02T00:00:00Z",
  recommendation: { action: "review_then_beginner_quiz", message: "You answered 2/5 correctly on Recursion, so review the linked notes and try a beginner quiz." },
};
const emptySummary = {
  documents_total: 0, documents_ready: 0, quizzes_completed: 0, average_score_percent: null,
  topics_needing_revision: 0, needs_revision: [], next_step: null, recent_activity: [], score_history: [], latest_document: null,
};

beforeEach(() => vi.clearAllMocks());

describe("TopicRow", () => {
  it("shows accuracy as text, not only as a bar, plus the explainable recommendation", () => {
    render(<TopicRow topic={topic} />);
    expect(screen.getByText("40% · 2 of 5 correct")).toBeInTheDocument();
    expect(screen.getByText("Needs revision")).toBeInTheDocument();
    expect(screen.getByText(/2\/5 correctly on Recursion/)).toBeInTheDocument();
  });
});

describe("ProgressView", () => {
  it("explains the first step instead of showing empty charts", async () => {
    vi.mocked(progressApi.topics).mockResolvedValue({ items: [], rules });
    vi.mocked(progressApi.summary).mockResolvedValue(emptySummary);
    render(<ProgressView />);
    expect(await screen.findByText("No quiz results yet")).toBeInTheDocument();
    expect(screen.queryByText("chart")).not.toBeInTheDocument();
  });

  it("shows topics and the rule behind the labels, using thresholds from the backend", async () => {
    vi.mocked(progressApi.topics).mockResolvedValue({ items: [topic], rules });
    vi.mocked(progressApi.summary).mockResolvedValue({ ...emptySummary, quizzes_completed: 1 });
    render(<ProgressView />);
    expect(await screen.findByText("Recursion")).toBeInTheDocument();
    expect(screen.getByText(/below 60% correct/)).toBeInTheDocument();
    expect(screen.getByText(/not a measure of ability/i)).toBeInTheDocument();
    expect(screen.queryByText("chart")).not.toBeInTheDocument(); // fewer than 3 quizzes
  });
});
