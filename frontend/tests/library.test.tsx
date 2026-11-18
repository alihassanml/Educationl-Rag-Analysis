import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "@/components/library/library-view";
import { documentsApi } from "@/lib/api";
import type { StudyDocument } from "@/types/api";

vi.mock("@/lib/api", () => ({ documentsApi: { list: vi.fn(), remove: vi.fn(), upload: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// jsdom has no <dialog> modal support
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const doc = (over: Partial<StudyDocument> = {}): StudyDocument => ({
  id: "d1", title: "OS Notes", original_filename: "os.pdf", file_size: 2048, status: "ready",
  error_message: null, page_count: 12, created_at: "2026-01-01T00:00:00Z", ...over,
});

describe("LibraryView", () => {
  it("shows the dropzone as the empty state, with the file picker available", async () => {
    vi.mocked(documentsApi.list).mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView />);
    expect(await screen.findByText("Drop a PDF here or choose a file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload PDF" })).toBeInTheDocument(); // the one primary action
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
