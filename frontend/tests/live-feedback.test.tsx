import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveFeedback } from "@/components/evaluation/live-feedback";
import { ApiError } from "@/lib/api-client";
import { tutorApi } from "@/lib/api";
import type { FeedbackItem } from "@/types/api";

vi.mock("@/lib/api", () => ({ tutorApi: { recentFeedback: vi.fn() } }));

const item = (over: Partial<FeedbackItem> = {}): FeedbackItem => ({
  message_id: "m1", rating: "down", reason: "missing_source", question: "What is recursion?",
  answer: "A function that calls itself [1].", abstained: false, created_at: "2026-11-18T10:00:00Z", ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("LiveFeedback", () => {
  it("lists recent feedback with the question, the answer and a text rating", async () => {
    vi.mocked(tutorApi.recentFeedback).mockResolvedValue([
      item(),
      item({ message_id: "m2", rating: "up", reason: null, question: "Define a stack", answer: "", abstained: true }),
    ]);
    render(<LiveFeedback />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Thumbs down")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Missing source")).toBeInTheDocument();
    expect(within(rows[0]).getByText("What is recursion?")).toBeInTheDocument();
    expect(within(rows[0]).getByText("A function that calls itself [1].")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Thumbs up")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Declined to answer")).toBeInTheDocument();
  });

  it("says when there is no feedback yet, with no fake zero", async () => {
    vi.mocked(tutorApi.recentFeedback).mockResolvedValue([]);
    render(<LiveFeedback />);
    expect(await screen.findByText("No feedback yet")).toBeInTheDocument();
  });

  it("shows an error with Retry", async () => {
    vi.mocked(tutorApi.recentFeedback).mockRejectedValueOnce(new ApiError("Something broke", 500, "x")).mockResolvedValueOnce([]);
    render(<LiveFeedback />);
    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No feedback yet")).toBeInTheDocument();
  });
});
