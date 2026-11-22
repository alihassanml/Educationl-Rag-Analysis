import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizResult } from "@/components/quizzes/quiz-result";
import { quizzesApi } from "@/lib/api";
import type { AttemptResult } from "@/types/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ quizzesApi: { notesPdf: vi.fn(), generate: vi.fn() } }));

const result: AttemptResult = {
  attempt_id: "a1", quiz_id: "q1", quiz_title: "Recursion (beginner)", topic: "Recursion", score: 1, total_questions: 2,
  percent: 50, completed_at: "2026-11-22T10:00:00Z", topic_status: "needs_revision",
  recommendation: { action: "review_then_beginner_quiz", message: "You answered 1/2 correctly on Recursion, so start with a beginner quiz." },
  previous_difficulty: "beginner", next_difficulty: "beginner", level_change: "same", topic_id: "t1",
  difficulty_reason: "You scored 1/2, so your next quiz on Recursion stays beginner.",
  results: [
    {
      question_id: "x1", question_text: "What stops a recursive function?", options: ["A loop", "A base case"], selected_index: 1, correct_index: 1,
      is_correct: true, explanation: "The notes say a recursive function needs a base case.", sources: [{ document_title: "Programming notes", page_number: 1 }],
    },
    {
      question_id: "x2", question_text: "What does the call stack hold?", options: ["Frames", "Files"], selected_index: 1, correct_index: 0,
      is_correct: false, explanation: "Each call places a frame on the call stack.", sources: [{ document_title: "Programming notes", page_number: 2 }],
    },
  ],
};

describe("QuizResult", () => {
  it("shows the score once, as a sentence, with the percentage", () => {
    render(<QuizResult result={result} />);
    expect(screen.getAllByText(/1 of 2 correct/)).toHaveLength(1);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
  });

  it("marks each question as correct or incorrect in words, and reveals the right answer only for a miss", () => {
    render(<QuizResult result={result} />);
    const [first, second] = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("What"));
    expect(within(first).getByText("Correct")).toBeInTheDocument();
    expect(within(first).queryByText("Correct answer:")).not.toBeInTheDocument();
    expect(within(second).getByText("Incorrect")).toBeInTheDocument();
    expect(within(second).getByText("Frames")).toBeInTheDocument(); // the correct answer
    expect(within(second).getByText("Files")).toBeInTheDocument(); // the student's answer
  });

  it("keeps the explanation and the source for every question", () => {
    render(<QuizResult result={result} />);
    expect(screen.getByText("The notes say a recursive function needs a base case.")).toBeInTheDocument();
    expect(screen.getByText("Source: Programming notes, page 2")).toBeInTheDocument();
  });

  it("gives one primary next step for a topic that needs revision", () => {
    render(<QuizResult result={result} />);
    expect(screen.getByRole("link", { name: "Review this topic" }).getAttribute("href")).toContain("/tutor?q=");
    expect(screen.getByRole("button", { name: "Try another quiz" })).toBeInTheDocument();
  });

  it("shows the level and why it changed or stayed", () => {
    const { rerender } = render(<QuizResult result={result} />);
    expect(screen.getByText("Same level")).toBeInTheDocument();
    expect(screen.getByText("You scored 1/2, so your next quiz on Recursion stays beginner.")).toBeInTheDocument();

    rerender(
      <QuizResult
        result={{ ...result, previous_difficulty: "intermediate", next_difficulty: "advanced", level_change: "up", difficulty_reason: "You scored 9/10, so your next quiz on Recursion will be advanced." }}
      />,
    );
    expect(screen.getByText("Level up")).toBeInTheDocument();
    expect(screen.getByText("Intermediate → Advanced")).toBeInTheDocument();
  });

  it("shows nothing about levels for a quiz without a topic", () => {
    render(<QuizResult result={{ ...result, topic: null, previous_difficulty: null, next_difficulty: null, level_change: null, difficulty_reason: null, topic_id: null, topic_status: null }} />);
    expect(screen.queryByText("Same level")).not.toBeInTheDocument();
  });

  it("offers the notes as a PDF download", () => {
    render(<QuizResult result={result} />);
    expect(screen.getByRole("button", { name: "Download notes (PDF)" })).toBeInTheDocument();
  });
});


describe("next quiz after a result", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(quizzesApi.generate).mockReset();
  });
  const strong: AttemptResult = { ...result, score: 9, total_questions: 10, percent: 90, topic_status: "doing_well", previous_difficulty: "intermediate", next_difficulty: "advanced", level_change: "up", difficulty_reason: "You scored 9/10, so your next quiz on Recursion will be advanced." };

  it("'Try a harder quiz' creates a quiz on the same topic at the next level", async () => {
    vi.mocked(quizzesApi.generate).mockResolvedValue({ id: "q2" } as never);
    render(<QuizResult result={strong} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a harder quiz" }));
    await waitFor(() => expect(quizzesApi.generate).toHaveBeenCalledWith({ topic: "Recursion", difficulty: "advanced", num_questions: 10 }));
    expect(push).toHaveBeenCalledWith("/quizzes/q2");
  });

  it("offers an easier quiz after a poor result, at the lower level", async () => {
    vi.mocked(quizzesApi.generate).mockResolvedValue({ id: "q3" } as never);
    render(<QuizResult result={{ ...result, topic_status: "practicing", previous_difficulty: "intermediate", next_difficulty: "beginner", level_change: "down" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Try an easier quiz" }));
    await waitFor(() => expect(quizzesApi.generate).toHaveBeenCalledWith({ topic: "Recursion", difficulty: "beginner", num_questions: 2 }));
  });

  it("shows an error and stays on the page when the quiz cannot be written", async () => {
    vi.mocked(quizzesApi.generate).mockRejectedValue(new Error("boom"));
    render(<QuizResult result={strong} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a harder quiz" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the quiz");
    expect(push).not.toHaveBeenCalled();
  });
});
