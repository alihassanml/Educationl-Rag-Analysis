import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { progressApi } from "@/lib/api";
import type { ProgressSummary, TopicProgress } from "@/types/api";

vi.mock("@/lib/api", () => ({ progressApi: { summary: vi.fn() } }));
vi.mock("@/components/progress/score-chart", () => ({ ScoreChart: () => <div>chart</div>, MIN_POINTS_FOR_CHART: 3 }));

const topic: TopicProgress = {
  topic_id: "t1", topic_name: "Recursion", questions_attempted: 5, correct_answers: 2, accuracy_percent: 40,
  status: "needs_revision", last_practiced_at: "2026-01-02T00:00:00Z",
  recommendation: { action: "review_then_beginner_quiz", message: "You answered 2/5 correctly on Recursion, so start with a beginner quiz." },
};
const empty: ProgressSummary = {
  documents_total: 0, documents_ready: 0, quizzes_completed: 0, average_score_percent: null,
  topics_needing_revision: 0, needs_revision: [], next_step: null, recent_activity: [], score_history: [], latest_document: null,
};

beforeEach(() => vi.clearAllMocks());

describe("DashboardView", () => {
  it("shows a three-step checklist for a new student, with one primary action and no zero-filled stats", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(empty);
    render(<DashboardView />);
    expect(await screen.findByText("Get started in three steps")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload PDF" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Upload PDF" }).className).toContain("bg-clay-strong"); // current step is primary
    expect(screen.getByRole("link", { name: "Ask a question" }).className).not.toContain("bg-clay-strong");
    expect(screen.queryByText("Average quiz score")).not.toBeInTheDocument();
    expect(screen.queryByText("Recommended next step")).not.toBeInTheDocument();
  });

  it("never reports 'Ask your first question' as done, because the API does not record questions", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1, quizzes_completed: 0 });
    render(<DashboardView />);
    expect(await screen.findByText("Recommended next step")).toBeInTheDocument(); // returning layout once a document exists
  });

  it("recommends the next step from the backend message and links to a quiz and the tutor for that topic", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({
      ...empty, documents_total: 1, documents_ready: 1, quizzes_completed: 2, average_score_percent: 55,
      topics_needing_revision: 1, needs_revision: [topic], next_step: topic,
      recent_activity: [{ quiz_id: "q1", quiz_title: "Recursion", topic: "Recursion", score: 2, total_questions: 5, percent: 40, completed_at: "2026-01-02T00:00:00Z" }],
    });
    render(<DashboardView />);
    const card = (await screen.findByText("Recommended next step")).closest("section")!;
    expect(within(card).getByText("Recursion")).toBeInTheDocument();
    expect(within(card).getByText(/start with a beginner quiz/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Practise this topic" })).toHaveAttribute("href", "/quizzes?topic=Recursion");
    expect(within(card).getByRole("link", { name: "Ask the tutor about this" }).getAttribute("href")).toContain("/tutor?q=");
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.queryByText("chart")).not.toBeInTheDocument(); // fewer than 3 attempts
  });

  it("shows a dash and 'No data yet' instead of a fake zero when there is no average", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1, latest_document: { id: "d", title: "OS Notes" } });
    render(<DashboardView />);
    expect(await screen.findByText("OS Notes")).toBeInTheDocument();
    expect(screen.getAllByText("No data yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("limits the revision list to five rows", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...topic, topic_id: `t${i}`, topic_name: `Topic ${i}` }));
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1, quizzes_completed: 3, needs_revision: many, next_step: many[0] });
    render(<DashboardView />);
    await screen.findByRole("heading", { name: "Needs revision" });
    expect(screen.getAllByRole("link", { name: "Practise" })).toHaveLength(5);
  });
});
