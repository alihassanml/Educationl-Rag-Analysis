import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { QuizResult } from "@/components/quizzes/quiz-result";
import type { AttemptResult } from "@/types/api";

vi.mock("@/lib/api", () => ({ quizzesApi: { notesPdf: vi.fn() } }));

const result: AttemptResult = {
  attempt_id: "a1", quiz_id: "q1", quiz_title: "Recursion (beginner)", topic: "Recursion", score: 1, total_questions: 2,
  percent: 50, completed_at: "2026-11-22T10:00:00Z", topic_status: "needs_revision",
  recommendation: { action: "review_then_beginner_quiz", message: "You answered 1/2 correctly on Recursion, so start with a beginner quiz." },
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
    expect(screen.getByRole("link", { name: "Try another quiz" })).toHaveAttribute("href", "/tutor?mode=quiz");
  });

  it("offers the notes as a PDF download", () => {
    render(<QuizResult result={result} />);
    expect(screen.getByRole("button", { name: "Download notes (PDF)" })).toBeInTheDocument();
  });
});
