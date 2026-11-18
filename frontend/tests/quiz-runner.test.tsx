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
    { id: "a", position: 1, question_text: "First question", options: ["A1", "A2", "A3"] },
    { id: "b", position: 2, question_text: "Second question", options: ["B1", "B2"] },
  ],
};

/** Answer question 1 with `first`, move on, answer question 2 with `second`. */
async function answerBoth(first: string, second: string) {
  await userEvent.click(screen.getByLabelText(first));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByLabelText(second));
}

beforeEach(() => vi.clearAllMocks());

describe("QuizRunner", () => {
  it("shows one question at a time and keeps Next disabled until an option is chosen", async () => {
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    expect(screen.getByText("First question")).toBeInTheDocument();
    expect(screen.queryByText("Second question")).not.toBeInTheDocument();
    expect(screen.getAllByText("Question 1 of 2").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText("A2"));
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("offers Submit quiz only on the last question, disabled until every question is answered, and never shows answers", async () => {
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Submit quiz" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("A2"));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Submit quiz" })).toBeDisabled();
    expect(screen.getByText("1 of 2 answered")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("B1"));
    expect(screen.getByRole("button", { name: "Submit quiz" })).toBeEnabled();
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
  });

  it("keeps earlier answers when going back", async () => {
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    await answerBoth("A3", "B2");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("A3")).toBeChecked();
  });

  it("selects options with the number keys and moves on with Enter", async () => {
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("A1")); // focus inside the form
    await userEvent.keyboard("3");
    expect(screen.getByLabelText("A3")).toBeChecked();
    await userEvent.keyboard("9"); // no such option: ignored
    expect(screen.getByLabelText("A3")).toBeChecked();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("Second question")).toBeInTheDocument();
  });

  it("submits the selected option index for every question", async () => {
    vi.mocked(quizzesApi.submit).mockResolvedValue({} as never);
    const onSubmitted = vi.fn();
    render(<QuizRunner quiz={quiz} onSubmitted={onSubmitted} />);
    await answerBoth("A2", "B1");
    await userEvent.click(screen.getByRole("button", { name: "Submit quiz" }));
    expect(quizzesApi.submit).toHaveBeenCalledWith("q1", [
      { question_id: "a", selected_index: 1 },
      { question_id: "b", selected_index: 0 },
    ]);
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it("blocks duplicate submissions while the request is pending", async () => {
    vi.mocked(quizzesApi.submit).mockReturnValue(new Promise(() => undefined));
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    await answerBoth("A1", "B1");
    await userEvent.click(screen.getByRole("button", { name: "Submit quiz" }));
    expect(screen.getByRole("button", { name: "Submitting" })).toBeDisabled();
    expect(quizzesApi.submit).toHaveBeenCalledTimes(1);
  });

  it("keeps the selections and shows the error when submitting fails", async () => {
    vi.mocked(quizzesApi.submit).mockRejectedValue(new ApiError("Could not reach the server.", 0, "network_error"));
    render(<QuizRunner quiz={quiz} onSubmitted={vi.fn()} />);
    await answerBoth("A1", "B2");
    await userEvent.click(screen.getByRole("button", { name: "Submit quiz" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(screen.getByLabelText("B2")).toBeChecked();
    expect(screen.getByRole("button", { name: "Submit quiz" })).toBeEnabled();
  });

  it("shows the saved result when the quiz was already submitted elsewhere", async () => {
    vi.mocked(quizzesApi.submit).mockRejectedValue(new ApiError("You have already submitted this quiz", 409, "already_submitted"));
    const onSubmitted = vi.fn();
    render(<QuizRunner quiz={quiz} onSubmitted={onSubmitted} />);
    await answerBoth("A1", "B1");
    await userEvent.click(screen.getByRole("button", { name: "Submit quiz" }));
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });
});
