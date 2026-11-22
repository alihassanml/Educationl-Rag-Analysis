import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExamPredictorView } from "@/components/exam-predictor/exam-predictor-view";
import { examApi } from "@/lib/api";
import type { EvidenceQuestion, ExamPrediction, PredictedTopic } from "@/types/api";

vi.mock("@/lib/api", () => ({ examApi: { get: vi.fn(), analyse: vi.fn(), setPriority: vi.fn() } }));

const evidence = (over: Partial<EvidenceQuestion> = {}): EvidenceQuestion => ({
  question_id: "q1", text: "Explain how recursion works.", marks: 10, page_number: 3, document_id: "d1", paper_title: "Paper 2025", paper_year: 2025, paper_session: "Summer", similarity: 0.7, ...over,
});

const topic = (over: Partial<PredictedTopic> = {}): PredictedTopic => ({
  topic_id: "t1", name: "Recursion", score: 92, label: "High", explanation: "Appeared in 4 of 5 papers, most recently 2025", papers_with_topic: 4, total_papers: 5, most_recent_year: 2025,
  total_marks: 40, question_count: 9, evidence: [evidence()], level: "intermediate", status: "needs_revision", pinned: false, ...over,
});

const prediction = (over: Partial<ExamPrediction> = {}): ExamPrediction => ({
  status: "ok", message: null, min_papers: 2,
  papers: [{ document_id: "d1", title: "Paper 2025", year: 2025, session: "Summer", question_count: 6, processed: true }, { document_id: "d2", title: "Paper 2024", year: 2024, session: null, question_count: 5, processed: true }],
  pending_papers: 0, failed_papers: 0, topics: [topic(), topic({ topic_id: "t2", name: "Sorting", score: 45, label: "Medium", explanation: "Appeared in 2 of 5 papers, most recently 2024", pinned: true })],
  unmatched: [evidence({ question_id: "q9", text: "Describe tropical rainforests." })],
  rule: "A topic's likelihood score combines how many papers asked about it.", disclaimer: "Based only on the past papers you uploaded; not a guarantee.", ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("ExamPredictorView", () => {
  it("ranks topics with the rule in words and the disclaimer", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction());
    render(<ExamPredictorView />);
    const list = await screen.findByRole("list", { name: "Topics by likelihood" });
    const cards = within(list).getAllByRole("listitem");
    expect(within(cards[0]).getByText("Recursion")).toBeInTheDocument();
    expect(within(cards[0]).getByText("High")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Appeared in 4 of 5 papers, most recently 2025")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Based only on the past papers you uploaded; not a guarantee.")).toBeInTheDocument();
    expect(screen.getByText(/combines how many papers asked about it/)).toBeInTheDocument();
  });

  it("shows the real past questions as evidence, with a link to the paper", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction());
    render(<ExamPredictorView />);
    await userEvent.click((await screen.findAllByRole("button", { name: /Past questions \(9\)/ }))[0]);
    const evidenceList = screen.getByRole("list", { name: "Past questions on Recursion" });
    expect(within(evidenceList).getByText("Explain how recursion works.")).toBeInTheDocument();
    const link = within(evidenceList).getByRole("link", { name: /Paper 2025 · Summer · page 3/ });
    expect(link).toHaveAttribute("href", "/tutor?doc=d1");
    expect(screen.getByText("Showing 1 of 9 questions")).toBeInTheDocument();
  });

  it("lists unmatched questions apart from the topics", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction());
    render(<ExamPredictorView />);
    expect(await screen.findByText("Unmatched questions (1)")).toBeInTheDocument();
    expect(screen.getByText("Describe tropical rainforests.")).toBeInTheDocument();
  });

  it("offers a quiz, an explanation and the Course Map priority for each topic", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction());
    vi.mocked(examApi.setPriority).mockResolvedValue({ topic_id: "t1", pinned: true });
    render(<ExamPredictorView />);
    const first = (await screen.findAllByRole("listitem"))[0];
    expect(within(first).getByRole("link", { name: "Quiz me on this topic" })).toHaveAttribute("href", "/tutor?mode=quiz&q=Recursion");
    expect(within(first).getByRole("link", { name: "Explain this topic" }).getAttribute("href")).toBe("/tutor?q=Explain%20Recursion");
    await userEvent.click(within(first).getByRole("button", { name: "Add to my Course Map priority" }));
    expect(examApi.setPriority).toHaveBeenCalledWith("t1", true);
    expect(within(first).getByRole("button", { name: "On your Course Map priority" })).toHaveAttribute("aria-pressed", "true");
  });

  it("puts the priority button back when saving fails", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction());
    vi.mocked(examApi.setPriority).mockRejectedValue(new Error("offline"));
    render(<ExamPredictorView />);
    const first = (await screen.findAllByRole("listitem"))[0];
    await userEvent.click(within(first).getByRole("button", { name: "Add to my Course Map priority" }));
    expect(await within(first).findByRole("alert")).toHaveTextContent("Could not save");
    expect(within(first).getByRole("button", { name: "Add to my Course Map priority" })).toBeInTheDocument();
  });

  it("reads unread papers by itself, once, and then shows the result", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction({ pending_papers: 2, topics: [], unmatched: [], papers: [{ document_id: "d1", title: "A", year: 2025, session: null, question_count: 0, processed: false }, { document_id: "d2", title: "B", year: 2024, session: null, question_count: 0, processed: false }] }));
    vi.mocked(examApi.analyse).mockResolvedValue(prediction());
    render(<ExamPredictorView />);
    expect(await screen.findByRole("list", { name: "Topics by likelihood" })).toBeInTheDocument();
    expect(examApi.analyse).toHaveBeenCalledTimes(1);
  });

  it("says when a paper could not be read, and can try again", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction({ pending_papers: 1, papers: [{ document_id: "d1", title: "A", year: 2025, session: null, question_count: 0, processed: false }, { document_id: "d2", title: "B", year: 2024, session: null, question_count: 5, processed: true }] }));
    vi.mocked(examApi.analyse).mockResolvedValue(prediction({ pending_papers: 1, failed_papers: 1, papers: [{ document_id: "d1", title: "A", year: 2025, session: null, question_count: 0, processed: false }, { document_id: "d2", title: "B", year: 2024, session: null, question_count: 5, processed: true }] }));
    render(<ExamPredictorView />);
    const retry = await screen.findByRole("button", { name: "Read them now" });
    await userEvent.click(retry);
    await waitFor(() => expect(examApi.analyse).toHaveBeenCalledTimes(2));
  });

  it("asks for more papers when there are too few, and for none at all", async () => {
    vi.mocked(examApi.get).mockResolvedValue(prediction({ status: "need_more_papers", message: "Add more past papers. A prediction needs at least 2, and you have 1.", topics: [], unmatched: [] }));
    const { unmount } = render(<ExamPredictorView />);
    expect(await screen.findByText("Add more past papers", { selector: "h2, h3, p" })).toBeInTheDocument();
    expect(screen.getByText(/A prediction needs at least 2/)).toBeInTheDocument();
    expect(screen.getByText("Based only on the past papers you uploaded; not a guarantee.")).toBeInTheDocument();
    expect(examApi.analyse).not.toHaveBeenCalled();
    unmount();
    vi.mocked(examApi.get).mockResolvedValue(prediction({ status: "no_papers", message: "Upload past papers and mark them as Past paper in your library.", topics: [], papers: [] }));
    render(<ExamPredictorView />);
    expect(await screen.findByText("No past papers yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My library" })).toHaveAttribute("href", "/library");
  });

  it("shows an error with a retry when the page cannot load", async () => {
    vi.mocked(examApi.get).mockRejectedValue(new Error("down"));
    render(<ExamPredictorView />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
