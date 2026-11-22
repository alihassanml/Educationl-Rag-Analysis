import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { diagnosticApi, pathApi, progressApi, tutorApi } from "@/lib/api";
import type { ProgressSummary, StudyInsights, TopicProgress } from "@/types/api";

vi.mock("@/lib/api", () => ({ progressApi: { summary: vi.fn(), insights: vi.fn() }, tutorApi: { threads: vi.fn() }, diagnosticApi: { status: vi.fn(), start: vi.fn() }, pathApi: { get: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/progress/score-chart", () => ({ ScoreChart: () => <div>chart</div>, MIN_POINTS_FOR_CHART: 3 }));

const push = vi.fn();

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
  vi.mocked(diagnosticApi.status).mockRejectedValue(new Error("offline"));
  vi.mocked(pathApi.get).mockRejectedValue(new Error("offline"));
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
    const snapshot = await screen.findByRole("region", { name: "Snapshot" });
    expect(within(snapshot).getByText("Average quiz score")).toBeInTheDocument();
    expect(within(snapshot).getByText("70%")).toBeInTheDocument();
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

    // The streak is one number in the snapshot strip, not a card of its own
    const snapshot = await screen.findByRole("region", { name: "Snapshot" });
    expect(within(snapshot).getByText("Study streak")).toBeInTheDocument();
    expect(within(snapshot).getByText("3 days")).toBeInTheDocument();
    expect(within(snapshot).getByText(/Done today/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Study streak" })).not.toBeInTheDocument();

    // Only real numbers: 5 of 6 answers had sources, and no quiz tile before the first quiz
    expect(within(snapshot).getByText("83%")).toBeInTheDocument();
    expect(within(snapshot).queryByText("Average quiz score")).not.toBeInTheDocument();
    expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /6 questions and 0 quizzes on 3 days/ })).toBeInTheDocument();

    // Least explored document first, with small icon actions scoped to it
    const library = screen.getByRole("region", { name: "Library" });
    expect(within(library).getByText(/Not explored yet/)).toBeInTheDocument();
    expect(within(library).getByRole("meter", { name: "40% of pages explored" })).toBeInTheDocument();
    expect(within(library).getByRole("link", { name: "Summarise Networks" })).toHaveAttribute("href", "/tutor?mode=summary&doc=d2");
    expect(within(library).getByRole("meter", { name: "20% of your library explored" })).toBeInTheDocument();
    expect(within(library).getByRole("link", { name: /Start Networks/ })).toHaveAttribute("href", "/tutor?mode=summary&doc=d2");

    expect(screen.getByRole("link", { name: /Page 3 of Algorithms, cited 5 times/ })).toHaveAttribute("href", "/tutor?mode=quiz&doc=d1");
    // No card that repeats the chat's modes, and no decorative card icons
    expect(screen.queryByRole("region", { name: "Quick actions" })).not.toBeInTheDocument();
    expect(within(library).getByRole("link", { name: "Algorithms" })).toHaveAttribute("href", "/tutor?doc=d1"); // a title opens a chat about it
  });

  it("asks for today's study when the streak is alive but today is still empty", async () => {
    const base = insightsFixture();
    const activity = base.activity.map((d, i) => (i === base.activity.length - 1 ? { ...d, questions: 0 } : d));
    vi.mocked(progressApi.summary).mockResolvedValue({ ...empty, documents_total: 1, documents_ready: 1 });
    vi.mocked(progressApi.insights).mockResolvedValue({ ...base, activity, current_streak: 2 });
    render(<DashboardView />);
    expect(await screen.findByText(/Study today to keep it/)).toBeInTheDocument();
  });
});

describe("diagnostic card", () => {
  const studying: ProgressSummary = { ...empty, documents_total: 1, documents_ready: 1, latest_document: { id: "d1", title: "Notes" } };
  const status = { ready_documents: 1, topic_count: 4, available: true, taken: false, taken_at: null, latest_quiz_id: null, pending_quiz_id: null, suggested: true };

  it("invites a student with material who has never taken the diagnostic", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(studying);
    vi.mocked(diagnosticApi.status).mockResolvedValue(status);
    render(<DashboardView />);
    expect(await screen.findByRole("button", { name: "Start your diagnostic" })).toBeInTheDocument();
    expect(screen.getByText(/4 topics found in your material/)).toBeInTheDocument();
  });

  it("starts the diagnostic and opens it", async () => {
    push.mockClear();
    vi.mocked(progressApi.summary).mockResolvedValue(studying);
    vi.mocked(diagnosticApi.status).mockResolvedValue(status);
    vi.mocked(diagnosticApi.start).mockResolvedValue({ id: "qd1" } as never);
    render(<DashboardView />);
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(await screen.findByRole("button", { name: "Start your diagnostic" }));
    expect(push).toHaveBeenCalledWith("/quizzes/qd1");
  });

  it("offers to continue an unfinished diagnostic", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(studying);
    vi.mocked(diagnosticApi.status).mockResolvedValue({ ...status, pending_quiz_id: "qd1" });
    render(<DashboardView />);
    expect(await screen.findByRole("button", { name: "Continue your diagnostic" })).toBeInTheDocument();
  });

  it("stays away once the diagnostic has been taken, or when the status cannot be read", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(studying);
    vi.mocked(diagnosticApi.status).mockResolvedValue({ ...status, taken: true, suggested: false });
    const { unmount } = render(<DashboardView />);
    await screen.findByText("Recommended next step");
    expect(screen.queryByRole("button", { name: /diagnostic/i })).not.toBeInTheDocument();
    unmount();
    vi.mocked(diagnosticApi.status).mockRejectedValue(new Error("offline"));
    render(<DashboardView />);
    await screen.findByText("Recommended next step");
    expect(screen.queryByRole("button", { name: /diagnostic/i })).not.toBeInTheDocument();
  });

  it("shows no card to a student who has no material yet", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(empty);
    vi.mocked(diagnosticApi.status).mockResolvedValue({ ...status, available: false, suggested: false, ready_documents: 0, topic_count: 0 });
    render(<DashboardView />);
    await screen.findByText("Get started in three steps");
    expect(screen.queryByText("Start your diagnostic")).not.toBeInTheDocument();
  });
});

describe("Course Map card", () => {
  const studying: ProgressSummary = { ...empty, documents_total: 1, documents_ready: 1, latest_document: { id: "d1", title: "Notes" } };
  const step = (over: Record<string, unknown> = {}) => ({
    topic_id: "t1", name: "Recursion", position: 1, status: "needs_revision" as const, level: "beginner" as const, accuracy_percent: 40, questions_attempted: 5,
    sources: [], next_action: { kind: "revise" as const, message: "Revise this topic with the tutor, then take a quiz at your level." }, is_current: true, ...over,
  });

  it("shows the current step and the latest route update", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(studying);
    vi.mocked(pathApi.get).mockResolvedValue({
      steps: [step()], current_topic_id: "t1", events: [],
      latest_event: { id: "e1", topic_id: "t1", topic: "Recursion", old_status: "practicing", new_status: "needs_revision", reason: "Recursion moved up because you scored 2/5.", created_at: "2026-11-22T10:00:00Z" },
    });
    render(<DashboardView />);
    const card = await screen.findByRole("region", { name: "Your Course Map" });
    expect(within(card).getByText("Recursion")).toBeInTheDocument();
    expect(within(card).getByText("Beginner")).toBeInTheDocument();
    expect(within(card).getByText("Recursion moved up because you scored 2/5.")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Quiz on this topic" }).getAttribute("href")).toContain("q=Recursion");
    expect(within(card).getByRole("link", { name: "Open Course Map" })).toHaveAttribute("href", "/course-map");
  });

  it("says so when every topic is doing well", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(studying);
    vi.mocked(pathApi.get).mockResolvedValue({ steps: [step({ status: "doing_well", is_current: false })], current_topic_id: null, events: [], latest_event: null });
    render(<DashboardView />);
    expect(await screen.findByText(/doing well on every topic/)).toBeInTheDocument();
  });

  it("is left out when there are no topics or the path cannot be read", async () => {
    vi.mocked(progressApi.summary).mockResolvedValue(studying);
    vi.mocked(pathApi.get).mockResolvedValue({ steps: [], current_topic_id: null, events: [], latest_event: null });
    render(<DashboardView />);
    await screen.findByText("Recommended next step");
    expect(screen.queryByRole("region", { name: "Your Course Map" })).not.toBeInTheDocument();
  });
});
