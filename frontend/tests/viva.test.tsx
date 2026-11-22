import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VivaView } from "@/components/viva/viva-view";
import { pathApi, vivaApi } from "@/lib/api";
import type { VivaSessionDetail } from "@/types/api";

vi.mock("@/lib/api", () => ({
  pathApi: { get: vi.fn() },
  vivaApi: { sessions: vi.fn(), start: vi.fn(), answer: vi.fn(), tabSwitch: vi.fn(), session: vi.fn(), transcribe: vi.fn() },
}));

const turn = (over = {}) => ({ turn_index: 0, question_text: "What stops a recursive function?", is_follow_up_pending: false, follow_up_question: null, student_answer: null, is_completed: false, ...over });
const session = (over: Partial<VivaSessionDetail> = {}): VivaSessionDetail =>
  ({ id: "s1", topic_name: "Recursion", status: "in_progress", tab_switch_count: 0, current_turn_index: 0, total_turns: 2, time_limit_seconds: 90, current_turn: turn(), completed_turns: [], created_at: "2026-11-22T10:00:00Z", ...over }) as VivaSessionDetail;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(vivaApi.sessions).mockResolvedValue([]);
  vi.mocked(pathApi.get).mockResolvedValue({ steps: [], current_topic_id: null, events: [], latest_event: null });
  vi.mocked(vivaApi.tabSwitch).mockResolvedValue({ tab_switch_count: 0 });
  // No microphone in this browser: the exam falls back to typing
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
});

describe("VivaView", () => {
  it("has no intro text, only the topic field and one Start button", async () => {
    render(<VivaView />);
    expect(await screen.findByRole("heading", { name: "New exam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start exam" })).toBeDisabled();
    expect(screen.queryByText(/guidelines/i)).not.toBeInTheDocument();
  });

  it("starts with one click, shows the question, and takes a typed answer when there is no microphone", async () => {
    vi.mocked(vivaApi.start).mockResolvedValue(session());
    vi.mocked(vivaApi.answer).mockResolvedValue(session({ current_turn: turn({ turn_index: 0, is_follow_up_pending: true, follow_up_question: "Why does it need that?" }) }));
    render(<VivaView />);
    await userEvent.type(await screen.findByLabelText("Topic"), "Recursion");
    await userEvent.click(screen.getByRole("button", { name: "Start exam" }));

    expect(await screen.findByRole("heading", { name: "What stops a recursive function?" })).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    // Typing is on straight away: nothing to switch on first
    await userEvent.type(screen.getByLabelText("Your answer"), "The base case");
    await userEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect(vivaApi.answer).toHaveBeenCalledWith("s1", 0, "The base case", false);
    expect(await screen.findByRole("heading", { name: "Why does it need that?" })).toBeInTheDocument();
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
  });

  it("shows the score and per-question feedback when the exam is over", async () => {
    vi.mocked(vivaApi.start).mockResolvedValue(
      session({
        status: "completed",
        total_score: 9,
        max_score: 12,
        current_turn: null,
        overall_feedback: "Good grasp of base cases.",
        completed_turns: [{ turn_index: 0, question_text: "What stops a recursive function?", student_answer: "The base case", follow_up_question: null, follow_up_answer: null, grade_score: 5, grade_accuracy: 2, grade_completeness: 2, grade_own_words: 1, grade_feedback: "Clear.", ideal_answer: "A base case.", sources: [] }] as never,
      }),
    );
    render(<VivaView />);
    await userEvent.type(await screen.findByLabelText("Topic"), "Recursion");
    await userEvent.click(screen.getByRole("button", { name: "Start exam" }));
    expect(await screen.findByText("9 / 12")).toBeInTheDocument();
    expect(screen.getByText("Good grasp of base cases.")).toBeInTheDocument();
    expect(screen.getByText("5 / 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New exam" })).toBeInTheDocument();
  });
});
