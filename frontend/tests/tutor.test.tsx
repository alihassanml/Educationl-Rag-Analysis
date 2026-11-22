import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerBlock, type AnswerView } from "@/components/tutor/answer-card";
import { TutorView, suggestionsFor } from "@/components/tutor/tutor-view";
import { ApiError } from "@/lib/api-client";
import { documentsApi, quizzesApi, teacherStyleApi, tutorApi } from "@/lib/api";
import type { SseEvent } from "@/lib/sse";
import type { StudyDocument, ThreadDetail } from "@/types/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  documentsApi: { list: vi.fn(), addLink: vi.fn(), upload: vi.fn() },
  quizzesApi: { generate: vi.fn(), submit: vi.fn(), notesPdf: vi.fn() },
  teacherStyleApi: { status: vi.fn(), build: vi.fn() },
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
  error_message: null, page_count: 3, created_at: "2026-01-01T00:00:00Z", source_type: "pdf", ...over,
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

const noTeacher = { available: false, teacher_documents: [], ready: false, style: null };
const withTeacher = { available: true, teacher_documents: ["Teacher slides"], ready: false, style: null };

beforeEach(() => {
  vi.resetAllMocks();
  // jsdom has no <dialog> modal support
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.history.replaceState(null, "", "/tutor");
  vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc()], total: 1 });
  vi.mocked(tutorApi.threads).mockResolvedValue([]);
  vi.mocked(tutorApi.createThread).mockResolvedValue(thread());
  vi.mocked(teacherStyleApi.status).mockResolvedValue(noTeacher);
});

async function ask(text: string) {
  const box = await screen.findByLabelText("Your question");
  await userEvent.type(box, text);
  await userEvent.click(screen.getByRole("button", { name: "Send question" }));
}

const view = (over: Partial<AnswerView> = {}): AnswerView => ({ text: "", status: "complete", stage: null, sources: [], abstained: false, ...over });
const src = (marker: number) => ({ marker, chunkId: `c${marker}`, documentId: "d1", title: "Programming Notes", page: marker + 1, section: null, startSeconds: null, url: null, isTeacher: false, snippet: "Recursion is a method", deleted: false });

describe("AnswerBlock", () => {
  it("shows citation pills only for markers that are among the sources", () => {
    render(<AnswerBlock answer={view({ text: "True [1] and invented [4].", sources: [src(1)] })} />);
    expect(screen.getAllByRole("button", { name: /^Source 1/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText("[4]")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Source 4/ })).not.toBeInTheDocument();
  });

  it("keeps the sources in a collapsed dropdown above the answer text", async () => {
    render(<AnswerBlock answer={view({ text: "An answer [1].", sources: [src(1), src(2)] })} />);
    const toggle = screen.getByRole("button", { name: "2 sources" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Sources for this answer" })).not.toBeInTheDocument();
    expect(toggle.compareDocumentPosition(screen.getByText(/An answer/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("list", { name: "Sources for this answer" })).getAllByRole("button")).toHaveLength(2);
    await userEvent.click(toggle);
    expect(screen.queryByRole("list", { name: "Sources for this answer" })).not.toBeInTheDocument();
  });

  it("opens a source from the dropdown", async () => {
    const onOpenSource = vi.fn();
    render(<AnswerBlock answer={view({ text: "An answer [1].", sources: [src(1)] })} onOpenSource={onOpenSource} />);
    await userEvent.click(screen.getByRole("button", { name: "1 source" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Sources for this answer" })).getByRole("button"));
    expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ marker: 1 }));
  });

  it("puts Copy, Ask again and the ratings in small icon buttons, not labelled buttons", () => {
    render(<AnswerBlock answer={view({ id: "m1", text: "Done [1].", sources: [src(1)] })} onAskAgain={vi.fn()} onFeedback={vi.fn()} />);
    for (const name of ["Copy answer", "Ask again", "Good answer", "Poor answer"]) {
      const button = screen.getByRole("button", { name });
      expect(button.textContent).toBe(""); // an icon and nothing else
      expect(button.className).toContain("size-8");
    }
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

  it("marks a source whose document was deleted", async () => {
    render(<AnswerBlock answer={view({ text: "x [1]", sources: [{ ...src(1), documentId: null, deleted: true }] })} />);
    await userEvent.click(screen.getByRole("button", { name: "1 source" }));
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

describe("TutorView: adding material from the chat", () => {
  it("adds a pasted link (a page or an online PDF) to the library instead of asking it as a question", async () => {
    vi.mocked(documentsApi.addLink).mockResolvedValue(doc({ id: "d5", title: "lecture", source_type: "pdf" }));
    render(<TutorView />);
    const box = await screen.findByLabelText("Your question");
    await userEvent.type(box, "https://example.com/lecture.pdf");
    expect(screen.getByText("Press Enter to add this link to your library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add link to library" })).toBeEnabled();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(documentsApi.addLink).toHaveBeenCalledWith("https://example.com/lecture.pdf", undefined));
    expect(tutorApi.streamMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(box).toHaveValue(""));
    await waitFor(() => expect(documentsApi.list).toHaveBeenCalledTimes(2)); // the scope list now includes it
  });

  it("treats a sentence that contains a link as a normal question", async () => {
    controlledStream();
    render(<TutorView />);
    await ask("what does https://example.com say about recursion");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    expect(documentsApi.addLink).not.toHaveBeenCalled();
  });

  it("attaches a PDF from the composer and keeps the question box untouched", async () => {
    vi.mocked(documentsApi.upload).mockResolvedValue(doc({ id: "d6", title: "notes" }));
    render(<TutorView />);
    const box = await screen.findByLabelText("Your question");
    await userEvent.type(box, "half a question");
    await userEvent.upload(screen.getByLabelText("Choose a PDF to add"), new File(["%PDF-1.4"], "notes.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(documentsApi.upload).toHaveBeenCalled());
    expect(box).toHaveValue("half a question");
  });

  it("says why a link could not be added and keeps it in the box to fix", async () => {
    vi.mocked(documentsApi.addLink).mockRejectedValue(new ApiError("That address is not a public website", 400, "invalid_url"));
    render(<TutorView />);
    const box = await screen.findByLabelText("Your question");
    await userEvent.type(box, "http://127.0.0.1/admin{Enter}");
    expect(await screen.findByText("That address is not a public website")).toBeInTheDocument();
    expect(box).toHaveValue("http://127.0.0.1/admin");
  });
});

describe("TutorView: sending", () => {
  it("sends the chosen answer style with the question and labels the question in the chat", async () => {
    controlledStream();
    render(<TutorView />);
    expect(await screen.findByRole("button", { name: "Ask" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Summarise" }));
    expect(screen.getByRole("button", { name: "Summarise" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Your question")).toHaveAttribute("placeholder", "What should I summarise?");
    await ask("Recursion");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    const call = vi.mocked(tutorApi.streamMessage).mock.calls[0];
    expect(call[1]).toBe("Recursion"); // the question itself is not rewritten on the client
    expect(call[5]).toBe("summary");
  });

  it("makes Quiz me a real quiz inside the chat: generate, answer, submit, see the result", async () => {
    const quiz = {
      id: "q1", title: "Quiz on recursion", topic: "recursion", difficulty: "intermediate" as const, question_count: 2, source_documents: ["Programming Notes"], created_at: "2026-11-18T10:00:00Z", attempt: null,
      questions: [
        { id: "a", position: 1, question_text: "What stops recursion?", options: ["A base case", "A loop", "A stack", "A heap"] },
        { id: "b", position: 2, question_text: "What does a function call itself do?", options: ["Recurses", "Sorts", "Hashes", "Parses"] },
      ],
    };
    vi.mocked(quizzesApi.generate).mockResolvedValue(quiz);
    vi.mocked(quizzesApi.submit).mockResolvedValue({
      attempt_id: "at1", quiz_id: "q1", quiz_title: "Quiz on recursion", topic: "recursion", score: 1, total_questions: 2, percent: 50, completed_at: "2026-11-18T10:05:00Z",
      topic_status: "needs_revision", recommendation: { action: "review", message: "Review recursion before the next quiz." },
      previous_difficulty: "beginner", next_difficulty: "intermediate", level_change: "up", topic_id: "t1",
      difficulty_reason: "You scored 1/2, so your next quiz on recursion will be intermediate.",
      results: [
        { question_id: "a", question_text: "What stops recursion?", options: quiz.questions[0].options, selected_index: 0, correct_index: 0, is_correct: true, explanation: "The base case ends the calls.", sources: [{ document_title: "Programming Notes", page_number: 2 }] },
        { question_id: "b", question_text: "What does a function call itself do?", options: quiz.questions[1].options, selected_index: 1, correct_index: 0, is_correct: false, explanation: "That is recursion.", sources: [] },
      ],
    });
    render(<TutorView />);
    await userEvent.click(await screen.findByRole("button", { name: "Quiz me" }));
    await ask("quiz me on recursion, 2 questions"); // the quiz service writes at least 3

    expect(tutorApi.streamMessage).not.toHaveBeenCalled(); // a quiz is not a streamed answer
    await waitFor(() => expect(quizzesApi.generate).toHaveBeenCalledWith({ topic: "recursion", document_ids: undefined, num_questions: 3 }));
    const submit = await screen.findByRole("button", { name: "Submit answers" });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "A base case" }));
    await userEvent.click(screen.getByRole("radio", { name: "Sorts" }));
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(await screen.findByText(/1 of 2 correct/)).toBeInTheDocument();
    expect(quizzesApi.submit).toHaveBeenCalledWith("q1", [{ question_id: "a", selected_index: 0 }, { question_id: "b", selected_index: 1 }]);
    expect(screen.getByText("Review recursion before the next quiz.")).toBeInTheDocument();
    expect(screen.getByText("Incorrect")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quiz me again" })).toBeInTheDocument();
    expect(screen.getByText("Level up")).toBeInTheDocument();
    expect(screen.getByText("Beginner → Intermediate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try a harder quiz" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open full page/ })).toHaveAttribute("href", "/quizzes/q1");
  });

  it("continues the last quiz on 'give me 10 more' instead of looking for a topic called 'more'", async () => {
    const quiz = {
      id: "q1", title: "Quiz on whatsap agent", topic: "whatsap agent", difficulty: "intermediate" as const, question_count: 1, source_documents: ["Phynxa"], created_at: "2026-11-18T10:00:00Z", attempt: null,
      questions: [{ id: "a", position: 1, question_text: "How is a number linked?", options: ["QR code", "OAuth", "API key", "Email"] }],
    };
    vi.mocked(quizzesApi.generate).mockResolvedValue(quiz);
    render(<TutorView />);
    await userEvent.click(await screen.findByRole("button", { name: "Quiz me" }));
    await ask("whatsap agent");
    await screen.findByText("How is a number linked?");
    await ask("give me 10 more");
    await waitFor(() =>
      expect(quizzesApi.generate).toHaveBeenLastCalledWith({ topic: "whatsap agent", document_ids: undefined, num_questions: 10, exclude_quiz_id: "q1" }),
    );
  });

  it("quizzes the whole material when no topic is given, and says so when the quiz cannot be made", async () => {
    vi.mocked(quizzesApi.generate).mockRejectedValue(new ApiError("Upload a PDF first", 422, "no_material"));
    render(<TutorView />);
    await userEvent.click(await screen.findByRole("button", { name: "Quiz me" }));
    await ask("quiz me all topic maximum 10 quiz");
    await waitFor(() => expect(quizzesApi.generate).toHaveBeenCalledWith({ topic: undefined, document_ids: undefined, num_questions: 10 }));
    expect(await screen.findByText("Upload a PDF first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

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
    expect(await screen.findByRole("button", { name: "1 source" })).toBeInTheDocument();
    expect(screen.queryByText(/A method/)).not.toBeInTheDocument(); // sources are there before any text
    stream.emit({ event: "token", data: { text: "A method " } }, { event: "token", data: { text: "[1]." } });
    expect(await screen.findByText(/A method/)).toBeInTheDocument();
    stream.emit(done());
    stream.finish();
    expect(await screen.findByRole("button", { name: "Copy answer" })).toBeInTheDocument();
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

describe("TutorView: keyboard", () => {
  it("/ focuses the question box from anywhere on the page", async () => {
    render(<TutorView />);
    const box = await screen.findByLabelText("Your question");
    expect(box).not.toHaveFocus();
    await userEvent.keyboard("/");
    expect(box).toHaveFocus();
    expect(box).toHaveValue(""); // the slash is not typed into the box
  });
});

describe("Teacher style", () => {
  it("is switched off, with the reason, until teacher material is added", async () => {
    render(<TutorView />);
    const toggle = await screen.findByRole("button", { name: "Teacher style" });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/mark them as Teacher material/)).toBeInTheDocument();
  });

  it("asks for the answer in the teacher's style and learns the style when switched on", async () => {
    vi.mocked(teacherStyleApi.status).mockResolvedValue(withTeacher);
    vi.mocked(teacherStyleApi.build).mockResolvedValue({ ...withTeacher, ready: true });
    const stream = controlledStream();
    render(<TutorView />);
    const toggle = await screen.findByRole("button", { name: "Teacher style" });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(teacherStyleApi.build).toHaveBeenCalledTimes(1);
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    expect(vi.mocked(tutorApi.streamMessage).mock.calls[0][6]).toBe(true);
    stream.finish();
  });

  it("does not ask for the teacher's style unless the toggle is on", async () => {
    vi.mocked(teacherStyleApi.status).mockResolvedValue(withTeacher);
    controlledStream();
    render(<TutorView />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Teacher style" })).toBeEnabled());
    await ask("What is recursion?");
    await waitFor(() => expect(tutorApi.streamMessage).toHaveBeenCalled());
    expect(vi.mocked(tutorApi.streamMessage).mock.calls[0][6]).toBe(false);
  });

  it("shows the badge and lists the teacher sources", () => {
    const sources = [
      { marker: 1, chunkId: "c1", documentId: "d1", title: "Teacher slides", page: 2, section: null, startSeconds: null, url: null, isTeacher: true, snippet: "x", deleted: false },
      { marker: 2, chunkId: "c2", documentId: "d2", title: "My notes", page: 5, section: null, startSeconds: null, url: null, isTeacher: false, snippet: "y", deleted: false },
    ];
    render(<AnswerBlock answer={view({ text: "A pointer stores an address [1].", sources, teacherStyle: true })} />);
    expect(screen.getByText("In your teacher's style")).toBeInTheDocument();
    expect(screen.getByText("Teacher sources: Teacher slides, page 2")).toBeInTheDocument();
  });

  it("says so when no teacher material matched", () => {
    const sources = [{ marker: 1, chunkId: "c2", documentId: "d2", title: "My notes", page: 5, section: null, startSeconds: null, url: null, isTeacher: false, snippet: "y", deleted: false }];
    render(<AnswerBlock answer={view({ text: "Text [1].", sources, teacherStyle: true })} />);
    expect(screen.getByText(/No teacher material matched this question/)).toBeInTheDocument();
  });

  it("shows no badge on an ordinary answer", () => {
    render(<AnswerBlock answer={view({ text: "Plain answer." })} />);
    expect(screen.queryByText("In your teacher's style")).not.toBeInTheDocument();
  });
});

