import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerCard } from "@/components/tutor/answer-card";
import { TutorView } from "@/components/tutor/tutor-view";
import { ApiError } from "@/lib/api-client";
import { documentsApi, tutorApi } from "@/lib/api";
import type { AskResponse, StudyDocument } from "@/types/api";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/api", () => ({ documentsApi: { list: vi.fn() }, tutorApi: { ask: vi.fn() } }));

const doc = (over: Partial<StudyDocument> = {}): StudyDocument => ({
  id: "d1", title: "Programming Notes", original_filename: "p.pdf", file_size: 10, status: "ready",
  error_message: null, page_count: 3, created_at: "2026-01-01T00:00:00Z", ...over,
});
const citation = (page: number | null, chunk: string) => ({
  document_id: "d1", document_title: "Programming Notes", page_number: page, chunk_id: chunk,
});

beforeEach(() => vi.clearAllMocks());

describe("AnswerCard", () => {
  it("lists each document page once, from backend citations", () => {
    const response: AskResponse = {
      answer: "Recursion is a function calling itself.",
      citations: [citation(12, "c1"), citation(12, "c2"), citation(null, "c3")],
      insufficient_evidence: false,
    };
    render(<AnswerCard response={response} />);
    expect(screen.getAllByText(/Programming Notes, page 12/)).toHaveLength(1);
    expect(screen.getByText(/page not available/)).toBeInTheDocument();
  });

  it("shows a clear not-found state with no sources", () => {
    render(<AnswerCard response={{ answer: "Nothing found.", citations: [], insufficient_evidence: true }} />);
    expect(screen.getByText("Not found in your material")).toBeInTheDocument();
    expect(screen.queryByText(/Sources from your material/)).not.toBeInTheDocument();
  });
});

describe("TutorView", () => {
  it("asks the backend, shows the answer with its source, and keeps the page usable on error", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc()], total: 1 });
    vi.mocked(tutorApi.ask)
      .mockRejectedValueOnce(new ApiError("The AI service is busy right now", 503, "ai_unavailable"))
      .mockResolvedValueOnce({ answer: "A function that calls itself.", citations: [citation(2, "c1")], insufficient_evidence: false });

    render(<TutorView />);
    await userEvent.type(await screen.findByLabelText("Your question"), "What is recursion?");
    await userEvent.click(screen.getByRole("button", { name: "Ask your tutor" }));

    expect(await screen.findByText("The AI service is busy right now")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("A function that calls itself.")).toBeInTheDocument();
    expect(screen.getByText(/Programming Notes, page 2/)).toBeInTheDocument();
    await waitFor(() => expect(tutorApi.ask).toHaveBeenCalledTimes(2));
    expect(tutorApi.ask).toHaveBeenLastCalledWith("What is recursion?", []);
  });

  it("sends only the selected documents when a scope is chosen", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc(), doc({ id: "d2", title: "Biology" })], total: 2 });
    vi.mocked(tutorApi.ask).mockResolvedValue({ answer: "x", citations: [], insufficient_evidence: false });
    render(<TutorView />);
    await userEvent.click(await screen.findByLabelText("Biology"));
    await userEvent.type(screen.getByLabelText("Your question"), "What is a cell?");
    await userEvent.click(screen.getByRole("button", { name: "Ask your tutor" }));
    await waitFor(() => expect(tutorApi.ask).toHaveBeenCalledWith("What is a cell?", ["d2"]));
  });

  it("asks the student to upload a document when none is ready", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc({ status: "failed" })], total: 1 });
    render(<TutorView />);
    expect(await screen.findByText("Upload a document first")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your question")).not.toBeInTheDocument();
  });
});
