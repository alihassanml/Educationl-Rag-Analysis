import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadNotesButton } from "@/components/quizzes/download-notes-button";
import { quizzesApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

vi.mock("@/lib/api", () => ({ quizzesApi: { notesPdf: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:notes");
  URL.revokeObjectURL = vi.fn();
});

describe("DownloadNotesButton", () => {
  it("downloads the PDF under the name the server gave", async () => {
    vi.mocked(quizzesApi.notesPdf).mockResolvedValue({ blob: new Blob(["%PDF"]), filename: "recursion-notes.pdf" });
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    render(<DownloadNotesButton quizId="q1" />);
    await userEvent.click(screen.getByRole("button", { name: "Download notes (PDF)" }));
    await waitFor(() => expect(clicked).toEqual(["recursion-notes.pdf"]));
    expect(quizzesApi.notesPdf).toHaveBeenCalledWith("q1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:notes");
    click.mockRestore();
  });

  it("says what went wrong and lets the student try again", async () => {
    vi.mocked(quizzesApi.notesPdf).mockRejectedValue(new ApiError("Attempt not found", 404, "not_found"));
    render(<DownloadNotesButton quizId="q1" />);
    await userEvent.click(screen.getByRole("button", { name: "Download notes (PDF)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Attempt not found");
    expect(screen.getByRole("button", { name: "Download notes (PDF)" })).toBeEnabled();
  });
});
