import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "@/components/library/library-view";
import { documentsApi } from "@/lib/api";
import type { StudyDocument } from "@/types/api";

vi.mock("@/lib/api", () => ({ documentsApi: { list: vi.fn(), remove: vi.fn(), upload: vi.fn(), addLink: vi.fn(), addText: vi.fn(), addYoutube: vi.fn(), update: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// jsdom has no <dialog> modal support
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const doc = (over: Partial<StudyDocument> = {}): StudyDocument => ({
  id: "d1", title: "OS Notes", original_filename: "os.pdf", file_size: 2048, status: "ready",
  error_message: null, page_count: 12, created_at: "2026-01-01T00:00:00Z", source_type: "pdf", ...over,
});

describe("LibraryView", () => {
  it("shows the ways to add material as the empty state, with the file picker available", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView />);
    expect(await screen.findByText("Drop a PDF here or choose a file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose file" })).toBeInTheDocument();
    for (const name of ["PDF file", "Link", "Paste text"]) expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add source" })).not.toBeInTheDocument(); // the panel is already the page
  });

  it("opens the panel from the Add source button once there are documents", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc()], total: 1 });
    render(<LibraryView />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Add source" }));
    expect(screen.getByRole("tablist", { name: "How to add material" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("adds a link, a web page or an online PDF, and refreshes the list", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(documentsApi.addLink).mockResolvedValue(doc({ id: "d9", title: "lecture", source_type: "pdf" }));
    render(<LibraryView />);
    await userEvent.click(await screen.findByRole("tab", { name: "Link" }));
    const add = screen.getByRole("button", { name: "Add link" });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Web address"), "example.com/lecture.pdf");
    await userEvent.click(add);
    await waitFor(() => expect(documentsApi.addLink).toHaveBeenCalledWith("https://example.com/lecture.pdf", undefined));
    await waitFor(() => expect(documentsApi.list).toHaveBeenCalledTimes(2));
  });

  it("rejects something that is not a web address without calling the server", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView />);
    await userEvent.click(await screen.findByRole("tab", { name: "Link" }));
    await userEvent.type(screen.getByLabelText("Web address"), "not a link");
    await userEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a web address");
    expect(documentsApi.addLink).not.toHaveBeenCalled();
  });

  it("adds pasted text with a title, and asks for more when it is too short", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(documentsApi.addText).mockResolvedValue(doc({ source_type: "text" }));
    render(<LibraryView />);
    await userEvent.click(await screen.findByRole("tab", { name: "Paste text" }));
    await userEvent.type(screen.getByLabelText("Title"), "Week 3");
    await userEvent.type(screen.getByLabelText("Text"), "too short");
    await userEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 30 characters");
    expect(documentsApi.addText).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Text"), " and now a much longer piece of text to study");
    await userEvent.click(screen.getByRole("button", { name: "Add text" }));
    await waitFor(() => expect(documentsApi.addText).toHaveBeenCalledWith("Week 3", expect.stringContaining("much longer piece")));
  });

  it("shows where each document came from and a fitting next step when one fails", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({
      items: [
        doc({ id: "a", title: "Site", source_type: "website" }),
        doc({ id: "b", title: "Broken page", source_type: "website", status: "failed", error_message: "Not enough readable text was found to index." }),
      ],
      total: 2,
    });
    render(<LibraryView />);
    const table = (await screen.findAllByRole("table"))[0];
    expect(within(table).getAllByText("Web page").length).toBeGreaterThan(0);
    expect(within(table).getByText(/Not enough readable text/)).toHaveTextContent("Check the address or add it again");
  });

  it("rejects a non-PDF with a clear message and does not call the API", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView />);
    await screen.findByText("Drop a PDF here or choose a file");
    await userEvent.upload(document.getElementById("pdf-upload")!, new File(["hi"], "notes.txt", { type: "text/plain" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF files are supported");
    expect(documentsApi.upload).not.toHaveBeenCalled();
  });

  it("lists documents with status and pages, and shows the failure reason with the next step", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({
      items: [doc(), doc({ id: "d2", title: "Scan", status: "failed", error_message: "No readable text found", page_count: null })],
      total: 2,
    });
    render(<LibraryView />);
    const table = (await screen.findAllByRole("table"))[0];
    expect(within(table).getByText("OS Notes")).toBeInTheDocument();
    expect(within(table).getByText("12 pages")).toBeInTheDocument();
    expect(within(table).getByText("Ready")).toBeInTheDocument();
    expect(within(table).getByText("Failed")).toBeInTheDocument();
    expect(within(table).getByText(/No readable text found/)).toHaveTextContent("Upload a text-based PDF");
  });

  it("opens a ready document's chat from its title; a failed one's title is not a link", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc(), doc({ id: "d2", title: "Scan", status: "failed" })], total: 2 });
    render(<LibraryView />);
    const table = (await screen.findAllByRole("table"))[0];
    expect(within(table).getByRole("link", { name: "OS Notes" })).toHaveAttribute("href", "/tutor?doc=d1");
    expect(within(table).queryByRole("link", { name: "Scan" })).not.toBeInTheDocument();
  });

  it("searches by title and filters by type, with a count and a way back", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({
      items: [doc(), doc({ id: "d2", title: "Biology chapter", source_type: "website" }), doc({ id: "d3", title: "OS lecture", source_type: "text" })],
      total: 3,
    });
    render(<LibraryView />);
    const table = (await screen.findAllByRole("table"))[0];
    expect(screen.getByText("3 documents")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox", { name: "Search documents" }), "os");
    expect(within(table).queryByText("Biology chapter")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 3 documents")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "text");
    expect(within(table).queryByText("OS Notes")).not.toBeInTheDocument();
    expect(within(table).getByText("OS lecture")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox", { name: "Search documents" }), "zzz");
    expect(screen.getByText(/No documents match/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("3 documents")).toBeInTheDocument();
  });

  it("hides the type filter when every document is the same kind", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc(), doc({ id: "d2", title: "Scan" })], total: 2 });
    render(<LibraryView />);
    await screen.findAllByRole("table");
    expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
  });

  it("offers 'Open in tutor' only for ready documents, scoped to that document", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc(), doc({ id: "d2", title: "Scan", status: "failed" })], total: 2 });
    render(<LibraryView />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Actions for OS Notes" }))[0]);
    expect(screen.getByRole("menuitem", { name: "Open in tutor" })).toHaveAttribute("href", "/tutor?doc=d1");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getAllByRole("button", { name: "Actions for Scan" })[0]);
    expect(screen.queryByRole("menuitem", { name: "Open in tutor" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("asks before deleting, names the file, and deletes only after confirmation", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc()], total: 1 });
    vi.mocked(documentsApi.remove).mockResolvedValue(undefined);
    render(<LibraryView />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Actions for OS Notes" }))[0]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText("Delete OS Notes?")).toBeInTheDocument();
    expect(documentsApi.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete document" }));
    await waitFor(() => expect(documentsApi.remove).toHaveBeenCalledWith("d1"));
  });
});

describe("document kinds", () => {
  it("shows a chip for any kind except notes, with a past paper's year", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({
      items: [doc({ id: "a", title: "A", kind: "notes" }), doc({ id: "b", title: "B", kind: "past_paper", exam_year: 2025 }), doc({ id: "c", title: "C", kind: "teacher_material" })],
      total: 3,
    });
    render(<LibraryView />);
    expect(await screen.findAllByText("Past paper 2025")).not.toHaveLength(0);
    expect(screen.getAllByText("Teacher material").length).toBeGreaterThan(0);
  });

  it("filters by kind, and offers the filter only when kinds are mixed", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc({ id: "a", title: "Alpha notes" }), doc({ id: "b", title: "Beta paper", kind: "past_paper" })], total: 2 });
    render(<LibraryView />);
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Kind" }), "past_paper");
    expect(screen.getAllByText("Beta paper").length).toBeGreaterThan(0);
    expect(screen.queryByText("Alpha notes")).not.toBeInTheDocument();
  });

  it("hides the kind filter when every document has the same kind", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc({ id: "a" }), doc({ id: "b", title: "Other" })], total: 2 });
    render(<LibraryView />);
    await screen.findAllByText("OS Notes");
    expect(screen.queryByRole("combobox", { name: "Kind" })).not.toBeInTheDocument();
  });

  it("sends the kind and exam year with a link", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(documentsApi.addLink).mockResolvedValue(doc());
    render(<LibraryView />);
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "What is this?" }), "past_paper");
    await userEvent.type(screen.getByLabelText("Exam year"), "2025");
    await userEvent.type(screen.getByLabelText("Session"), "Summer");
    await userEvent.click(screen.getByRole("tab", { name: "Link" }));
    await userEvent.type(screen.getByLabelText("Web address"), "https://example.com/paper.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Add link" }));
    await waitFor(() => expect(documentsApi.addLink).toHaveBeenCalledWith("https://example.com/paper.pdf", undefined, { kind: "past_paper", exam_year: 2025, exam_session: "Summer" }));
  });

  it("changes a document's kind from its menu", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc()], total: 1 });
    vi.mocked(documentsApi.update).mockResolvedValue(doc({ kind: "textbook" }));
    render(<LibraryView />);
    await userEvent.click((await screen.findAllByRole("button", { name: /Actions for OS Notes/ }))[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Change type" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "What is this?" }), "textbook");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(documentsApi.update).toHaveBeenCalledWith("d1", { kind: "textbook" }));
  });
});

describe("YouTube lectures", () => {
  it("adds a video as a lecture", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(documentsApi.addYoutube).mockResolvedValue(doc({ source_type: "youtube", kind: "lecture" }));
    render(<LibraryView />);
    await userEvent.click(await screen.findByRole("tab", { name: "YouTube lecture" }));
    expect(screen.getByRole("combobox", { name: "What is this?" })).toHaveValue("lecture");
    await userEvent.type(screen.getByLabelText("YouTube link"), "https://youtu.be/dQw4w9WgXcQ");
    await userEvent.click(screen.getByRole("button", { name: "Add video" }));
    await waitFor(() => expect(documentsApi.addYoutube).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ", undefined, { kind: "lecture" }));
  });

  it("rejects a link that is not YouTube before asking the server", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView />);
    await userEvent.click(await screen.findByRole("tab", { name: "YouTube lecture" }));
    await userEvent.type(screen.getByLabelText("YouTube link"), "https://example.com/video");
    await userEvent.click(screen.getByRole("button", { name: "Add video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a YouTube link");
    expect(documentsApi.addYoutube).not.toHaveBeenCalled();
  });

  it("offers to paste the transcript when the video has no captions", async () => {
    const { ApiError } = await import("@/lib/api-client");
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(documentsApi.addYoutube).mockRejectedValue(new ApiError("No transcript could be read for this video. Paste the transcript as text instead.", 422, "no_transcript"));
    render(<LibraryView />);
    await userEvent.click(await screen.findByRole("tab", { name: "YouTube lecture" }));
    await userEvent.type(screen.getByLabelText("YouTube link"), "https://youtu.be/dQw4w9WgXcQ");
    await userEvent.click(screen.getByRole("button", { name: "Add video" }));
    await userEvent.click(await screen.findByRole("button", { name: "Paste the transcript instead" }));
    expect(screen.getByRole("tab", { name: "Paste text", selected: true })).toBeInTheDocument();
  });
});


describe("background indexing", () => {
  afterEach(() => vi.useRealTimers());

  it("checks again until a processing document is ready, then stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(documentsApi.list)
      .mockResolvedValueOnce({ items: [doc({ status: "processing", page_count: null })], total: 1 })
      .mockResolvedValue({ items: [doc({ status: "ready" })], total: 1 });
    render(<LibraryView />);
    expect(await screen.findByText(/Indexing your material in the background/)).toBeInTheDocument();
    expect(documentsApi.list).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2600);
    await waitFor(() => expect(documentsApi.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Indexing your material in the background/)).not.toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(10_000);
    expect(documentsApi.list).toHaveBeenCalledTimes(2); // nothing left to wait for
  });

  it("shows a document that fails in the background as failed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(documentsApi.list)
      .mockResolvedValueOnce({ items: [doc({ status: "processing" })], total: 1 })
      .mockResolvedValue({ items: [doc({ status: "failed", error_message: "No readable text was found." })], total: 1 });
    render(<LibraryView />);
    await screen.findByText(/Indexing your material in the background/);
    await vi.advanceTimersByTimeAsync(2600);
    expect((await screen.findAllByText(/No readable text was found/)).length).toBeGreaterThan(0);
  });

  it("does not poll when everything is already ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [doc()], total: 1 });
    render(<LibraryView />);
    await screen.findAllByText("OS Notes");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(documentsApi.list).toHaveBeenCalledTimes(1);
  });
});
