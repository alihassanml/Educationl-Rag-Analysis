import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { progressApi, tutorApi } from "@/lib/api";
import type { ProgressSummary, StudyInsights, TopicProgress } from "@/types/api";

vi.mock("@/lib/api", () => ({ progressApi: { summary: vi.fn(), insights: vi.fn() }, tutorApi: { threads: vi.fn() } }));
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

const chat = (id: string, title: string) => ({ id, title, created_at: "2026-11-18T10:00:00Z", updated_at: new Date().toISOString() });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(tutorApi.threads).mockResolvedValue([]);
  // Insights are optional: by default they fail, so the tests below cover the quiz-only fallback
  vi.mocked(progressApi.insights).mockRejectedValue(new Error("offline"));
});

/** Twelve weeks ending on 2026-11-22 (a Sunday), active on the last three days */
function insightsFixture(overrides: Partial<StudyInsights> = {}): StudyInsights {
  const activity = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(2026, 10, 22 - 83 + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date, questions: i >= 81 ? 2 : 0, quizzes: 0 };
  });
  return {
    questions_asked: 6, answers_with_sources: 5, answers_not_found: 1, citations_total: 9,
    pages_indexed: 20, chunks_indexed: 48, helpful_votes: 0, unhelpful_votes: 0,
    active_days: 3, current_streak: 3, longest_streak: 4, today: "2026-11-22", activity,
    documents: [
      { id: "d1", title: "Algorithms", source_type: "pdf", page_count: 10, chunk_count: 30, times_cited: 9, pages_cited: 4, last_cited_at: new Date().toISOString() },
      { id: "d2", title: "Networks", source_type: "website", page_count: 10, chunk_count: 18, times_cited: 0, pages_cited: 0, last_cited_at: null },
    ],
    hot_pages: [{ document_id: "d1", document_title: "Algorithms", page_number: 3, times_cited: 5 }],
    ...overrides,
  };
}

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

  it("marks 'Ask your first question' done only when the student has a saved chat", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 0 });
    vi.mocked(tutorApi.threads).mockResolvedValue([chat("c1", "What is recursion?")]);
    render(<DashboardView />);
    await screen.findByText("Get started in three steps");
    await screen.findByText("1 of 3 done");
    expect(screen.queryByRole("link", { name: "Ask a question" })).not.toBeInTheDocument();
  });

  it("shows the returning layout once a document exists", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1, quizzes_completed: 0 });
    render(<DashboardView />);
    expect(await screen.findByText("Recommended next step")).toBeInTheDocument();
  });

  it("lists recent chats once, with no second 'continue' card and no New chat link (the chat screen has it)", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1 });
    vi.mocked(tutorApi.threads).mockResolvedValue([chat("c1", "What is recursion?"), chat("c2", "Explain deadlock")]);
    render(<DashboardView />);
    expect(await screen.findByRole("link", { name: /What is recursion\?/ })).toHaveAttribute("href", "/tutor/c1");
    expect(screen.getByRole("link", { name: /Explain deadlock/ })).toHaveAttribute("href", "/tutor/c2");
    expect(screen.getAllByText("What is recursion?")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Continue chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New chat" })).not.toBeInTheDocument();
    expect(screen.queryByText("Pick up where you left off")).not.toBeInTheDocument();
  });

  it("still shows the dashboard when the chat list cannot be loaded", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1, latest_document: { id: "d", title: "OS Notes" } });
    vi.mocked(tutorApi.threads).mockRejectedValue(new Error("down"));
    render(<DashboardView />);
    expect(await screen.findByText("Recommended next step")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask the tutor" })).toHaveAttribute("href", "/tutor");
    expect(screen.queryByText("Recent chats")).not.toBeInTheDocument();
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
    expect(within(card).getByRole("link", { name: "Practise this topic" })).toHaveAttribute("href", "/tutor?mode=quiz&q=Recursion"); // quizzes happen in the chat
    expect(within(card).getByRole("link", { name: "Ask the tutor about this" }).getAttribute("href")).toContain("/tutor?q=");
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.queryByText("chart")).not.toBeInTheDocument(); // fewer than 3 attempts
  });

  it("shows no empty stat tiles, empty sections or fake zeros before the first quiz", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1, latest_document: { id: "d", title: "OS Notes" } });
    render(<DashboardView />);
    expect(await screen.findByText("OS Notes")).toBeInTheDocument();
    for (const text of ["No data yet", "Average quiz score", "Needs revision", "Recent quizzes", "No completed quizzes yet", "0%"]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("shows the numbers and sections once quizzes have been taken", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({
      ...empty, documents_total: 1, documents_ready: 1, quizzes_completed: 2, average_score_percent: 70, topics_needing_revision: 1,
      needs_revision: [topic], next_step: topic,
      recent_activity: [{ quiz_id: "q1", quiz_title: "Recursion quiz", topic: "Recursion", score: 7, total_questions: 10, percent: 70, completed_at: "2026-11-18T10:00:00Z" }],
    });
    render(<DashboardView />);
    expect(await screen.findByText("Average quiz score")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs revision" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent quizzes" })).toBeInTheDocument();
  });

  it("limits the revision list to five rows", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...topic, topic_id: `t${i}`, topic_name: `Topic ${i}` }));
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1, quizzes_completed: 3, needs_revision: many, next_step: many[0] });
    render(<DashboardView />);
    await screen.findByRole("heading", { name: "Needs revision" });
    expect(screen.getAllByRole("link", { name: "Practise" })).toHaveLength(5);
  });

  it("shows the streak, activity, library coverage and most cited pages from study insights", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 2, documents_ready: 2, latest_document: { id: "d1", title: "Algorithms" } });
    vi.mocked(progressApi.insights).mockResolvedValue(insightsFixture());
    render(<DashboardView />);

    const streak = await screen.findByRole("region", { name: "Study streak" });
    expect(within(streak).getByText("3", { selector: ".text-display" })).toBeInTheDocument();
    expect(within(streak).getByText(/You studied today/)).toBeInTheDocument();

    // Grounded answers: 5 of 6 answers had sources
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /6 questions and 0 quizzes on 3 days/ })).toBeInTheDocument();

    // Least explored document first, flagged, with actions scoped to it
    expect(screen.getByText("Not explored yet")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "40% of pages explored" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Summarise" })[0]).toHaveAttribute("href", "/tutor?mode=summary&doc=d2");
    expect(screen.getByText(/1 of your 2 documents hasn’t come up in a chat yet/)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Page 3 of Algorithms, cited 5 times/ })).toHaveAttribute("href", "/tutor?mode=quiz&doc=d1");
    expect(screen.getByRole("link", { name: /Quiz me.*Find your weak topics/ })).toHaveAttribute("href", "/tutor?mode=quiz&doc=d1");
  });

  it("asks for today's question when the streak is alive but today is still empty", async () => {
    const base = insightsFixture();
    const activity = base.activity.map((d, i) => (i === 83 ? { ...d, questions: 0 } : d));
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1 });
    vi.mocked(progressApi.insights).mockResolvedValue({ ...base, activity, current_streak: 2 });
    render(<DashboardView />);
    expect(await screen.findByText("Ask a question today to keep your streak alive")).toBeInTheDocument();
  });
});
