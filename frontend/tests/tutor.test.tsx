import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerBlock, type AnswerView } from "@/components/tutor/answer-card";
import { TutorView, suggestionsFor } from "@/components/tutor/tutor-view";
import { ApiError } from "@/lib/api-client";
import { documentsApi, tutorApi } from "@/lib/api";
import type { SseEvent } from "@/lib/sse";
import type { StudyDocument, ThreadDetail } from "@/types/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  documentsApi: { list: vi.fn() },
  tutorApi: {
    threads: vi.fn(),
    createThread: vi.fn(),
    thread: vi.fn(),
    renameThread: vi.fn(),
    deleteThread: vi.fn(),
    streamMessage: vi.fn(),
    feedback: vi.fn(),
  },
}));

const doc = (over: Partial<StudyDocument> = {}): StudyDocument => ({
  id: "d1", title: "Programming Notes", original_filename: "p.pdf", file_size: 10, status: "ready",
  error_message: null, page_count: 3, created_at: "2026-01-01T00:00:00Z", ...over,
});
const thread = (id = "t1", title = "What is recursion?") => ({ id, title, created_at: "2026-11-18T10:00:00Z", updated_at: new Date().toISOString() });
const source = { marker: 1, chunk_id: "c1", document_id: "d1", document_title: "Programming Notes", page_number: 2, snippet: "Recursion is a method" };
const done = (over: Record<string, unknown> = {}) => ({
  event: "done",
  data: { message_id: "m1", abstained: false, standalone_query: "What is recursion?", rewrite_used: false, unknown_markers: [], latency_ms: {}, ...over },
});

/** A stream the test controls: call emit() to deliver events and finish() to end it. */
function controlledStream() {
  let onEvent: (e: SseEvent) => void = () => undefined;
  let finish: () => void = () => undefined;
  let fail: (e: unknown) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(tutorApi.streamMessage).mockImplementationOnce((_t, _q, _d, handler, abortSignal) => {
    onEvent = handler;
    signal = abortSignal;
    return new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
      abortSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  return { emit: (...events: SseEvent[]) => events.forEach((e) => onEvent(e)), finish: () => finish(), fail: (e: unknown) => fail(e), get signal() { return signal; } };
}

beforeEach(() => {
  vi.resetAllMocks();
  // jsdom has no <dialog> modal support
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.history.replaceState(null, "", "/tutor");
  vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc()], total: 1 });
  vi.mocked(tutorApi.threads).mockResolvedValue([]);
  vi.mocked(tutorApi.createThread).mockResolvedValue(thread());
});

async function ask(text: string) {
  const box = await screen.findByLabelText("Your question");
  await userEvent.type(box, text);
  await userEvent.click(screen.getByRole("button", { name: "Send question" }));
}

const view = (over: Partial<AnswerView> = {}): AnswerView => ({ text: "", status: "complete", stage: null, sources: [], abstained: false, ...over });
const src = (marker: number) => ({ marker, chunkId: `c${marker}`, documentId: "d1", title: "Programming Notes", page: marker + 1, snippet: "Recursion is a method", deleted: false });

describe("AnswerBlock", () => {
  it("shows citation pills only for markers that are among the sources", () => {
    render(<AnswerBlock answer={view({ text: "True [1] and invented [4].", sources: [src(1)] })} />);
    expect(screen.getAllByRole("button", { name: /^Source 1/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText("[4]")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Source 4/ })).not.toBeInTheDocument();
  });

  it("shows source cards above the answer text", () => {
    render(<AnswerBlock answer={view({ text: "An answer [1].", sources: [src(1)] })} />);
    const card = screen.getByRole("list", { name: "Sources for this answer" });
    const text = screen.getByText(/An answer/);
    expect(card.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a designed not-found state for an abstained answer", () => {
    render(<AnswerBlock answer={view({ abstained: true, text: "I could not find it" })} />);
    expect(screen.getByText("Not found in your material")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload a source" })).toHaveAttribute("href", "/library");
  });

  it("labels a stopped answer and keeps its text", () => {
    render(<AnswerBlock answer={view({ text: "Half an answer", status: "stopped" })} />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Half an answer")).toBeInTheDocument();
  });

  it("shows only real stages while streaming", () => {
    render(<AnswerBlock answer={view({ status: "streaming", stage: "rewriting" })} />);
    expect(screen.getByText("Understanding your follow-up")).toBeInTheDocument();
  });

  it("offers Retry for a failed answer", async () => {
    const onRetry = vi.fn();
    render(<AnswerBlock answer={view({ status: "failed", error: "The AI service is busy right now" })} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("marks a source whose document was deleted", () => {
    render(<AnswerBlock answer={view({ text: "x [1]", sources: [{ ...src(1), documentId: null, deleted: true }] })} />);
    expect(screen.getAllByText(/Source deleted/).length).toBeGreaterThan(0);
  });
});

describe("suggestionsFor", () => {
  it("builds four prompts from real document titles and never invents a title", () => {
    const prompts = suggestionsFor([doc({ title: "OS Notes" }), doc({ id: "d2", title: "Biology" })]);
    expect(prompts).toHaveLength(4);
    expect(prompts[0]).toBe("Summarise the key ideas in OS Notes");
    expect(prompts[1]).toBe("Explain the hardest topic in Biology simply");
    expect(suggestionsFor([])).toEqual([]);
  });
});

describe("TutorView: sending", () => {
  it("creates a thread, shows sources first, streams the text and keeps the URL in step", async () => {
    const stream = controlledStream();
    render(<TutorView />);
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    expect(tutorApi.createThread).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tutorApi.streamMessage).mock.calls[0].slice(0, 3)).toEqual(["t1", "What is recursion?", []]);
    expect(window.location.pathname).toBe("/tutor/t1");
    expect(screen.getByLabelText("Your question")).toHaveValue("");

    stream.emit({ event: "status", data: { stage: "searching" } });
    expect(await screen.findByText("Searching your material")).toBeInTheDocument();
    stream.emit({ event: "sources", data: [source] }, { event: "status", data: { stage: "writing" } });
    expect(await screen.findByRole("list", { name: "Sources for this answer" })).toBeInTheDocument();
    expect(screen.queryByText(/A method/)).not.toBeInTheDocument(); // sources are there before any text
    stream.emit({ event: "token", data: { text: "A method " } }, { event: "token", data: { text: "[1]." } });
    expect(await screen.findByText(/A method/)).toBeInTheDocument();
    stream.emit(done());
    stream.finish();
    expect(await screen.findByRole("button", { name: "Copy answer" })).toBeInTheDocument();
    expect(tutorApi.threads).toHaveBeenCalledTimes(2); // the history is refreshed after the answer
  });

  it("sends with Enter, adds a line with Shift+Enter, and reuses the thread for the next question", async () => {
    const first = controlledStream();
    render(<TutorView />);
    const box = await screen.findByLabelText("Your question");
    await userEvent.type(box, "What is recursion?{Shift>}{Enter}{/Shift}Second line");
    expect(box).toHaveValue("What is recursion?\nSecond line");
    expect(tutorApi.streamMessage).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalledTimes(1));
    first.emit({ event: "sources", data: [] }, done({ abstained: true }));
    first.finish();
    await screen.findByText("Not found in your material");

    controlledStream();
    await userEvent.type(screen.getByLabelText("Your question"), "And a follow up?{Enter}");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalledTimes(2));
    expect(tutorApi.createThread).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tutorApi.streamMessage).mock.calls[1][0]).toBe("t1");
  });

  it("does not send a second question while an answer is being written", async () => {
    controlledStream();
    render(<TutorView />);
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText("Your question"), "Another question{Enter}");
    expect(tutorApi.streamMessage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Send question" })).not.toBeInTheDocument();
  });

  it("shows what was actually searched when a follow-up was rewritten", async () => {
    const stream = controlledStream();
    render(<TutorView />);
    await ask("Why is that needed?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    stream.emit({ event: "sources", data: [source] }, { event: "token", data: { text: "Because [1]." } }, done({ rewrite_used: true, standalone_query: "Why is a base case needed in recursion?" }));
    stream.finish();
    expect(await screen.findByText("Searched your material for: Why is a base case needed in recursion?")).toBeInTheDocument();
  });

  it("keeps the question in the composer and offers Retry when sending fails", async () => {
    vi.mocked(tutorApi.streamMessage).mockRejectedValueOnce(new ApiError("The AI service is busy right now", 503, "ai_unavailable"));
    render(<TutorView />);
    await ask("What is recursion?");
    expect(await screen.findByText("The AI service is busy right now")).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toHaveValue("What is recursion?");
    controlledStream();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalledTimes(2));
  });

  it("shows an error event from the server with the partial text", async () => {
    const stream = controlledStream();
    render(<TutorView />);
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    stream.emit({ event: "token", data: { text: "Partial " } }, { event: "error", data: { code: "provider_unavailable", message: "The AI service is busy right now" } });
    stream.finish();
    expect(await screen.findByText("The AI service is busy right now")).toBeInTheDocument();
    expect(screen.getByText("Partial")).toBeInTheDocument();
  });

  it("sends only the selected documents when a scope is chosen", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc(), doc({ id: "d2", title: "Biology" })], total: 2 });
    controlledStream();
    render(<TutorView />);
    await userEvent.click(await screen.findByRole("button", { name: "All my documents" }));
    await userEvent.click(screen.getByLabelText("Biology"));
    await ask("What is a cell?");
    await waitFor(() => expect(vi.mocked(tutorApi.streamMessage).mock.calls[0].slice(0, 3)).toEqual(["t1", "What is a cell?", ["d2"]]));
  });
});

describe("TutorView: Stop", () => {
  it("turns Send into Stop, aborts the request and labels the answer Stopped", async () => {
    const stream = controlledStream();
    render(<TutorView />);
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    stream.emit({ event: "sources", data: [source] }, { event: "token", data: { text: "Half an " } });
    await userEvent.click(await screen.findByRole("button", { name: "Stop answer" }));
    expect(stream.signal?.aborted).toBe(true);
    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText(/Half an/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send question" })).toBeInTheDocument();
  });

  it("stops with Escape", async () => {
    const stream = controlledStream();
    render(<TutorView />);
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    await userEvent.keyboard("{Escape}");
    expect(stream.signal?.aborted).toBe(true);
    expect(await screen.findByText("Stopped")).toBeInTheDocument();
  });
});

describe("TutorView: history", () => {
  const saved: ThreadDetail = {
    ...thread("t9", "Recursion basics"),
    messages: [
      { id: "u1", role: "user", content: "What is recursion?", standalone_query: null, rewrite_used: false, abstained: false, status: "complete", created_at: "2026-11-18T10:00:00Z", citations: [], feedback: null },
      { id: "a1", role: "assistant", content: "A function calling itself [1].", standalone_query: null, rewrite_used: false, abstained: false, status: "complete", created_at: "2026-11-18T10:00:01Z", feedback: "up",
        citations: [{ marker: 1, chunk_id: "c1", document_id: "d1", document_title: "Programming Notes", page_number: 2, snippet: "Recursion is a method", source_deleted: false }] },
    ],
  };

  it("reopens a saved thread with its messages, citations and feedback", async () => {
    vi.mocked(tutorApi.thread).mockResolvedValue(saved);
    vi.mocked(tutorApi.threads).mockResolvedValue([thread("t9", "Recursion basics")]);
    render(<TutorView threadId="t9" />);
    expect(await screen.findByText("What is recursion?", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/A function calling itself/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Source 1/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Good answer" })).toHaveAttribute("aria-pressed", "true");
    expect(tutorApi.thread).toHaveBeenCalledWith("t9", expect.anything());
  });

  it("says so when a saved thread cannot be found", async () => {
    vi.mocked(tutorApi.thread).mockRejectedValue(new ApiError("Thread not found", 404, "not_found"));
    render(<TutorView threadId="gone" />);
    expect(await screen.findByText("Thread not found")).toBeInTheDocument();
  });

  it("groups past chats, filters them by title and starts a new chat", async () => {
    vi.mocked(tutorApi.threads).mockResolvedValue([thread("t1", "Recursion basics"), thread("t2", "Photosynthesis")]);
    render(<TutorView />);
    const history = await screen.findByRole("navigation", { name: "Chat history" });
    expect(within(history).getByText("Today")).toBeInTheDocument();
    expect(within(history).getByRole("link", { name: "Recursion basics" })).toHaveAttribute("href", "/tutor/t1");
    await userEvent.type(within(history).getByRole("searchbox", { name: "Search chats" }), "photo");
    expect(within(history).queryByText("Recursion basics")).not.toBeInTheDocument();
    expect(within(history).getByText("Photosynthesis")).toBeInTheDocument();
  });

  it("renames a chat in place", async () => {
    vi.mocked(tutorApi.threads).mockResolvedValue([thread("t1", "Recursion basics")]);
    vi.mocked(tutorApi.renameThread).mockResolvedValue(thread("t1", "Recursion revision"));
    render(<TutorView />);
    await userEvent.click(await screen.findByRole("button", { name: "Options for Recursion basics" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Chat title" });
    await userEvent.clear(input);
    await userEvent.type(input, "Recursion revision{Enter}");
    await waitFor(() => expect(tutorApi.renameThread).toHaveBeenCalledWith("t1", "Recursion revision"));
  });

  it("asks before deleting a chat, then removes it", async () => {
    vi.mocked(tutorApi.threads).mockResolvedValue([thread("t1", "Recursion basics")]);
    vi.mocked(tutorApi.deleteThread).mockResolvedValue(undefined);
    render(<TutorView />);
    await userEvent.click(await screen.findByRole("button", { name: "Options for Recursion basics" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(tutorApi.deleteThread).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Delete chat" }));
    await waitFor(() => expect(tutorApi.deleteThread).toHaveBeenCalledWith("t1"));
  });
});

describe("TutorView: feedback", () => {
  async function answered() {
    const stream = controlledStream();
    render(<TutorView />);
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    stream.emit({ event: "sources", data: [source] }, { event: "token", data: { text: "A method [1]." } }, done());
    stream.finish();
    await screen.findByRole("button", { name: "Copy answer" });
  }

  it("saves a thumbs up", async () => {
    vi.mocked(tutorApi.feedback).mockResolvedValue({ message_id: "m1", rating: "up", reason: null });
    await answered();
    await userEvent.click(screen.getByRole("button", { name: "Good answer" }));
    await waitFor(() => expect(tutorApi.feedback).toHaveBeenCalledWith("m1", "up", undefined));
  });

  it("saves a thumbs down and then a reason", async () => {
    vi.mocked(tutorApi.feedback).mockResolvedValue({ message_id: "m1", rating: "down", reason: null });
    await answered();
    await userEvent.click(screen.getByRole("button", { name: "Poor answer" }));
    await waitFor(() => expect(tutorApi.feedback).toHaveBeenCalledWith("m1", "down", undefined));
    await userEvent.click(await screen.findByRole("button", { name: "Missing source" }));
    await waitFor(() => expect(tutorApi.feedback).toHaveBeenLastCalledWith("m1", "down", "missing_source"));
  });

  it("asks the same question again in the same thread", async () => {
    await answered();
    controlledStream();
    await userEvent.click(screen.getByRole("button", { name: "Ask again" }));
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(tutorApi.streamMessage).mock.calls[1].slice(0, 2)).toEqual(["t1", "What is recursion?"]);
  });
});

describe("TutorView: empty states", () => {
  it("fills the composer from a suggestion without sending it", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc({ title: "OS Notes" })], total: 1 });
    render(<TutorView />);
    await userEvent.click(await screen.findByRole("button", { name: "Summarise the key ideas in OS Notes" }));
    expect(screen.getByLabelText("Your question")).toHaveValue("Summarise the key ideas in OS Notes");
    expect(tutorApi.streamMessage).not.toHaveBeenCalled();
  });

  it("asks the student to upload a document when none is ready", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc({ status: "failed" })], total: 1 });
    render(<TutorView />);
    expect(await screen.findByText("Upload a document first")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your question")).not.toBeInTheDocument();
  });
});
