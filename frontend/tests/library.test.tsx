import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "@/components/library/library-view";
import { documentsApi } from "@/lib/api";
import type { StudyDocument } from "@/types/api";

vi.mock("@/lib/api", () => ({ documentsApi: { list: vi.fn(), remove: vi.fn(), upload: vi.fn(), addLink: vi.fn(), addText: vi.fn() } }));
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
