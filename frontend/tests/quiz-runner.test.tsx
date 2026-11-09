import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizRunner } from "@/components/quizzes/quiz-runner";
import { ApiError } from "@/lib/api-client";
import { quizzesApi } from "@/lib/api";
import type { QuizDetail } from "@/types/api";

vi.mock("@/lib/api", () => ({ quizzesApi: { submit: vi.fn() } }));

const quiz: QuizDetail = {
  id: "q1", title: "Recursion (beginner)", topic: "Recursion", difficulty: "beginner", question_count: 2,
  source_documents: ["Notes"], created_at: "2026-01-01T00:00:00Z", attempt: null,
  questions: [
    { id: "a", position: 1, question_text: "First question", options: ["A1", "A2"] },
    { id: "b", position: 2, question_text: "Second question", options: ["B1", "B2"] },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("QuizRunner", () => {
  it("keeps Submit disabled until every question is answered, and never shows answers", async () => {
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Submit answers" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("0 of 2 answered")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("A2"));
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByLabelText("B1"));
    expect(screen.getByText("2 of 2 answered")).toBeInTheDocument();
    expect(submit).toBeEnabled();
  });

  it("submits the selected option index for every question", async () => {
    vi.mocked(quizzesApi.submit).mockResolvedValue({} as never);
    const onSubmitted = vi.fn();
    render(<QuizRunner quiz={quiz} onSubmitted={onSubmitted} />);
    await userEvent.click(screen.getByLabelText("A2"));
    await userEvent.click(screen.getByLabelText("B1"));
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(quizzesApi.submit).toHaveBeenCalledWith("q1", [
      { question_id: "a", selected_index: 1 },
      { question_id: "b", selected_index: 0 },
    ]);
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it("blocks duplicate submissions while the request is pending", async () => {
    vi.mocked(quizzesApi.submit).mockReturnValue(new Promise(() => undefined));
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("A1"));
    await userEvent.click(screen.getByLabelText("B1"));
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(screen.getByRole("button", { name: "Submitting" })).toBeDisabled();
    expect(quizzesApi.submit).toHaveBeenCalledTimes(1);
  });

  it("keeps the selections and shows the error when submitting fails", async () => {
    vi.mocked(quizzesApi.submit).mockRejectedValue(new ApiError("Could not reach the server.", 0, "network_error"));
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("A1"));
    await userEvent.click(screen.getByLabelText("B2"));
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(screen.getByLabelText("A1")).toBeChecked();
    expect(screen.getByLabelText("B2")).toBeChecked();
    expect(screen.getByRole("button", { name: "Submit answers" })).toBeEnabled();
  });

  it("shows the saved result when the quiz was already submitted elsewhere", async () => {
    vi.mocked(quizzesApi.submit).mockRejectedValue(new ApiError("You have already submitted this quiz", 409, "already_submitted"));
    const onSubmitted = vi.fn();
    render(<QuizRunner quiz={quiz} onSubmitted={onSubmitted} />);
    await userEvent.click(screen.getByLabelText("A1"));
    await userEvent.click(screen.getByLabelText("B1"));
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });
});
