import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LightStepView } from "@/components/light-mode/light-step-view";
import { QuizResult } from "@/components/quizzes/quiz-result";
import { SettingsView } from "@/components/settings/settings-view";
import { authApi, diagnosticApi, lightModeApi } from "@/lib/api";
import type { AttemptResult, Recap } from "@/types/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), useParams: () => ({ episodeId: "e1" }) }));
vi.mock("@/lib/api", () => ({
  lightModeApi: { recap: vi.fn(), confidenceQuiz: vi.fn() },
  authApi: { setPreferences: vi.fn(), logout: vi.fn() },
  diagnosticApi: { status: vi.fn(), start: vi.fn() },
  quizzesApi: { notesPdf: vi.fn(), generate: vi.fn() },
}));
vi.mock("@/components/auth/session-provider", () => ({ useUser: () => ({ id: "u1", email: "a@b.c", is_admin: false, lighter_steps_enabled: true, created_at: "2026-01-01T00:00:00Z" }) }));

const recap: Recap = {
  episode_id: "e1", topic: "Recursion", sentences: ["Recursion is a function calling itself.", "It needs a base case.", "Each call is smaller."],
  example: "A factorial calls itself with a smaller number.", memory_tip: "Base case first.", sources: [{ document_title: "Notes", page_number: 3, section_title: "Chapter 2" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  push.mockClear();
  vi.mocked(diagnosticApi.status).mockResolvedValue({ ready_documents: 0, topic_count: 0, available: false, taken: false, taken_at: null, latest_quiz_id: null, pending_quiz_id: null, suggested: false });
});

describe("LightStepView", () => {
  it("shows the cited recap, example and memory tip", async () => {
    vi.mocked(lightModeApi.recap).mockResolvedValue(recap);
    render(<LightStepView />);
    expect(await screen.findByText("A lighter step on Recursion")).toBeInTheDocument();
    expect(screen.getByText(/Recursion is a function calling itself\. It needs a base case\./)).toBeInTheDocument();
    expect(screen.getByText("A factorial calls itself with a smaller number.")).toBeInTheDocument();
    expect(screen.getByText("Base case first.")).toBeInTheDocument();
    expect(screen.getByText("Source: Notes, Chapter 2, page 3")).toBeInTheDocument();
  });

  it("opens the confidence quiz", async () => {
    vi.mocked(lightModeApi.recap).mockResolvedValue(recap);
    vi.mocked(lightModeApi.confidenceQuiz).mockResolvedValue({ id: "cq1" } as never);
    render(<LightStepView />);
    await userEvent.click(await screen.findByRole("button", { name: "Take the confidence quiz" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/quizzes/cq1"));
  });

  it("explains when the material cannot support a recap", async () => {
    const { ApiError } = await import("@/lib/api-client");
    vi.mocked(lightModeApi.recap).mockRejectedValue(new ApiError("Your material does not explain this topic well enough to write a recap.", 422, "insufficient_evidence"));
    render(<LightStepView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("does not explain this topic");
    expect(screen.getByRole("link", { name: "Back to the Course Map" })).toHaveAttribute("href", "/course-map");
  });
});

describe("light mode on a quiz result", () => {
  const base = {
    attempt_id: "a", quiz_id: "q", quiz_title: "Recursion (beginner)", topic: "Recursion", score: 1, total_questions: 5, percent: 20, completed_at: "2026-11-22T10:00:00Z",
    topic_status: "needs_revision", recommendation: null, previous_difficulty: "beginner", next_difficulty: "beginner", level_change: "same", difficulty_reason: "You scored 1/5.", topic_id: "t1", results: [],
  } as unknown as AttemptResult;

  it("offers a quick recap in supportive words", () => {
    render(<QuizResult result={{ ...base, light_mode: { episode_id: "e1", topic_id: "t1", topic: "Recursion", state: "active", message: "Let's take a lighter step on Recursion: a quick recap, then a short confidence quiz." } }} />);
    expect(screen.getByText(/Let's take a lighter step on Recursion/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start with a quick recap" })).toHaveAttribute("href", "/light-mode/e1");
    expect(screen.queryByText(/frustrated/i)).not.toBeInTheDocument();
  });

  it("says the step is complete after a passed confidence quiz, with no recap button", () => {
    render(<QuizResult result={{ ...base, kind: "confidence", score: 3, light_mode: { episode_id: "e1", topic_id: "t1", topic: "Recursion", state: "passed", message: "Well done. You are back on your normal path for Recursion." } }} />);
    expect(screen.getByText(/back on your normal path/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /recap/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open your Course Map" })).toBeInTheDocument();
  });

  it("shows nothing about light mode otherwise", () => {
    render(<QuizResult result={{ ...base, light_mode: null }} />);
    expect(screen.queryByText(/lighter step/i)).not.toBeInTheDocument();
  });
});

describe("Settings toggle", () => {
  it("is on by default and saves a change", async () => {
    vi.mocked(authApi.setPreferences).mockResolvedValue({} as never);
    render(<SettingsView />);
    const box = screen.getByRole("checkbox", { name: /Lighter steps when I'm struggling/ });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(authApi.setPreferences).toHaveBeenCalledWith({ lighter_steps_enabled: false });
    expect(box).not.toBeChecked();
  });

  it("puts the toggle back and says so when saving fails", async () => {
    vi.mocked(authApi.setPreferences).mockRejectedValue(new Error("offline"));
    render(<SettingsView />);
    const box = screen.getByRole("checkbox", { name: /Lighter steps when I'm struggling/ });
    await userEvent.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(box).toBeChecked();
  });
});
