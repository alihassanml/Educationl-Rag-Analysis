import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { tutorApi } from "@/lib/api";
import { NEW_CHAT_EVENT } from "@/lib/chat-events";
import type { ThreadSummary } from "@/types/api";

const push = vi.fn();
let pathname = "/dashboard";
let admin = false;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), push }),
}));
vi.mock("@/components/auth/session-provider", () => ({
  useUser: () => ({ id: "1", email: "student@example.com", is_admin: admin, created_at: "2026-01-01" }),
}));
vi.mock("@/lib/api", () => ({
  authApi: { logout: vi.fn() },
  tutorApi: { threads: vi.fn(), renameThread: vi.fn(), deleteThread: vi.fn() },
}));

const thread = (id: string, title: string): ThreadSummary => ({ id, title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
const rail = () => screen.getAllByRole("navigation", { name: "Main" })[0];
const railHistory = () => within(rail()).getByRole("button", { name: "Chat history" });
// The top bar's History button, which opens the full-page history on small screens
const openHistory = async () => userEvent.click(screen.getAllByRole("button", { name: "Chat history" }).at(-1)!);

beforeEach(() => {
  vi.clearAllMocks();
  pathname = "/dashboard";
  admin = false;
  vi.mocked(tutorApi.threads).mockResolvedValue([thread("t1", "Recursion basics"), thread("t2", "Photosynthesis")]);
  // jsdom has no <dialog> modal support
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

describe("icon rail", () => {
  it("is a slim set of labelled icon buttons, with no big sidebar or history column", () => {
    render(<AppShell>content</AppShell>);
    const rail = screen.getAllByRole("navigation", { name: "Main" })[0];
    for (const name of ["New chat", "Search chats", "Dashboard", "My library", "Progress", "Chat history", "Account"]) {
      expect(within(rail).getByRole(name === "Dashboard" || name === "My library" || name === "Progress" ? "link" : "button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Study tutor" })).not.toBeInTheDocument(); // the + button is the tutor
    expect(screen.queryByRole("complementary", { name: "Chats" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument(); // closed until asked for
  });

  it("shows the Evaluation Lab only to admins", () => {
    const { unmount } = render(<AppShell>content</AppShell>);
    expect(screen.queryByRole("link", { name: "Evaluation Lab" })).not.toBeInTheDocument();
    unmount();
    admin = true;
    render(<AppShell>content</AppShell>);
    expect(screen.getAllByRole("link", { name: "Evaluation Lab" }).length).toBeGreaterThan(0);
  });

  it("New chat tells an open chat screen to reset, and goes to the tutor from other pages", async () => {
    const listener = vi.fn();
    window.addEventListener(NEW_CHAT_EVENT, listener);
    const { unmount } = render(<AppShell>content</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/tutor");

    unmount();
    pathname = "/tutor/t1";
    push.mockClear();
    render(<AppShell>content</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(push).not.toHaveBeenCalled(); // already on the chat screen: it resets itself
    window.removeEventListener(NEW_CHAT_EVENT, listener);
  });

  it("opens the account menu with the email, Settings and Sign out", async () => {
    render(<AppShell>content</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(within(screen.getByRole("menu", { name: "Account" })).getByText("student@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("expanding sidebar", () => {
  const aside = () => rail().closest("aside")!;

  it("widens in place from the History button instead of opening a page over the content", async () => {
    render(<AppShell>content</AppShell>);
    expect(aside().className).toContain("w-[76px]");
    expect(aside().className).toContain("transition-[width]"); // grows smoothly; the page beside it narrows with it
    expect(railHistory()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Recent chats" })).not.toBeInTheDocument();

    await userEvent.click(railHistory());
    expect(aside().className).toContain("w-[280px]");
    expect(railHistory()).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument();
    for (const name of ["New chat", "Dashboard", "My library", "Progress", "Chat history"]) expect(within(rail()).getByText(name)).toBeVisible();

    const recents = await screen.findByRole("region", { name: "Recent chats" });
    expect(await within(recents).findByRole("link", { name: /Recursion basics/ })).toHaveAttribute("href", "/tutor/t1");

    await userEvent.click(railHistory()); // the same button folds it back
    expect(aside().className).toContain("w-[76px]");
    expect(screen.queryByRole("region", { name: "Recent chats" })).not.toBeInTheDocument();
  });

  it("opens from Search with the search box focused, and filters the recent chats", async () => {
    render(<AppShell>content</AppShell>);
    await userEvent.click(within(rail()).getByRole("button", { name: "Search chats" }));
    const box = within(rail()).getByRole("searchbox", { name: "Search chats" });
    await waitFor(() => expect(box).toHaveFocus());
    const recents = await screen.findByRole("region", { name: "Recent chats" });
    await within(recents).findByRole("link", { name: /Recursion basics/ });
    await userEvent.type(box, "photo");
    expect(within(recents).queryByText("Recursion basics")).not.toBeInTheDocument();
    expect(within(recents).getByText("Photosynthesis")).toBeInTheDocument();
    await userEvent.click(within(rail()).getByRole("button", { name: "Clear search" }));
    expect(within(recents).getByText("Recursion basics")).toBeInTheDocument();
  });

  it("reads the chats again each time it opens", async () => {
    render(<AppShell>content</AppShell>);
    await userEvent.click(railHistory());
    await screen.findByRole("link", { name: /Recursion basics/ });
    await userEvent.click(railHistory());
    await userEvent.click(railHistory());
    await waitFor(() => expect(tutorApi.threads).toHaveBeenCalledTimes(2));
  });

  it("renames and deletes chats from the sidebar", async () => {
    vi.mocked(tutorApi.renameThread).mockResolvedValue(thread("t1", "Recursion revision"));
    vi.mocked(tutorApi.deleteThread).mockResolvedValue(undefined);
    render(<AppShell>content</AppShell>);
    await userEvent.click(railHistory());
    const recents = await screen.findByRole("region", { name: "Recent chats" });
    await userEvent.click(await within(recents).findByRole("button", { name: "Options for Recursion basics" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Chat title" });
    await userEvent.clear(input);
    await userEvent.type(input, "Recursion revision{Enter}");
    await waitFor(() => expect(tutorApi.renameThread).toHaveBeenCalledWith("t1", "Recursion revision"));

    await userEvent.click(await within(recents).findByRole("button", { name: "Options for Photosynthesis" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete chat" }));
    await waitFor(() => expect(tutorApi.deleteThread).toHaveBeenCalledWith("t2"));
  });
});

describe("history page (small screens)", () => {
  const dialog = () => screen.findByRole("dialog", { name: "Chat history" });

  it("opens from the History button as a full page with one search bar and a flat list", async () => {
    render(<AppShell>content</AppShell>);
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument();
    await openHistory();
    const page = await dialog();
    expect(page.className).toContain("drawer-in"); // slides in from the left
    expect(page.className).toContain("inset-x-0"); // the whole screen below the top bar, not a small panel
    expect(within(page).getByRole("heading", { name: "Chats" })).toBeInTheDocument();
    expect(within(page).getByRole("searchbox", { name: "Search chats" })).toHaveFocus();
    expect(await within(page).findByRole("link", { name: /Recursion basics/ })).toHaveAttribute("href", "/tutor/t1");
    expect(within(page).getAllByText("just now")).toHaveLength(2); // a date sits beside each title
    // No filters or tabs, and no day groups: just the chats
    for (const text of ["Active", "Shared", "Archived", "Today"]) expect(within(page).queryByText(text)).not.toBeInTheDocument();
    expect(within(page).queryByRole("tab")).not.toBeInTheDocument();
  });

  it("does not open just from hovering: a click opens it", async () => {
    render(<AppShell>content</AppShell>);
    const button = screen.getAllByRole("button", { name: "Chat history" }).at(-1)!;
    await userEvent.hover(button);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument();
    await userEvent.click(button);
    await dialog();
  });

  it("filters as you type, can be cleared, and says when nothing matches", async () => {
    render(<AppShell>content</AppShell>);
    await openHistory();
    const page = await dialog();
    await within(page).findByRole("link", { name: /Recursion basics/ });
    const box = within(page).getByRole("searchbox", { name: "Search chats" });
    await userEvent.type(box, "photo");
    expect(within(page).queryByText("Recursion basics")).not.toBeInTheDocument();
    expect(within(page).getByText("Photosynthesis")).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, "zzz");
    expect(within(page).getByText("No chats match “zzz”")).toBeInTheDocument();
    await userEvent.click(within(page).getByRole("button", { name: "Clear search" }));
    expect(box).toHaveValue("");
    expect(within(page).getByText("Recursion basics")).toBeInTheDocument();
  });

  it("says how to start when there are no chats yet", async () => {
    vi.mocked(tutorApi.threads).mockResolvedValue([]);
    render(<AppShell>content</AppShell>);
    await openHistory();
    expect(await screen.findByText(/Your chats are saved here/)).toBeInTheDocument();
  });

  it("closes with Escape, the close button or the History button, and opens a chat then closes", async () => {
    render(<AppShell>content</AppShell>);
    await openHistory();
    await dialog();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument();

    await openHistory();
    await userEvent.click(await screen.findByRole("button", { name: "Close chats" }));
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument();

    await openHistory();
    await dialog();
    await openHistory(); // the same button again
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument();

    await openHistory();
    await userEvent.click(await screen.findByRole("link", { name: /Recursion basics/ }));
    expect(screen.queryByRole("dialog", { name: "Chat history" })).not.toBeInTheDocument();
  });

  it("slides out with an animation instead of vanishing", async () => {
    render(<AppShell>content</AppShell>);
    await openHistory();
    await dialog();
    await userEvent.keyboard("{Escape}");
    const leaving = document.querySelector('[aria-label="Chat history"][role="dialog"]');
    expect(leaving?.className).toContain("drawer-out"); // still there while it slides away
    expect(leaving).toHaveAttribute("aria-hidden", "true");
  });

  it("reads the chats again each time it opens", async () => {
    render(<AppShell>content</AppShell>);
    await openHistory();
    await screen.findByRole("link", { name: /Recursion basics/ });
    await userEvent.keyboard("{Escape}");
    await openHistory();
    await waitFor(() => expect(tutorApi.threads).toHaveBeenCalledTimes(2));
  });

  it("renames a chat in place", async () => {
    vi.mocked(tutorApi.renameThread).mockResolvedValue(thread("t1", "Recursion revision"));
    render(<AppShell>content</AppShell>);
    await openHistory();
    await userEvent.click(await screen.findByRole("button", { name: "Options for Recursion basics" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Chat title" });
    await userEvent.clear(input);
    await userEvent.type(input, "Recursion revision{Enter}");
    await waitFor(() => expect(tutorApi.renameThread).toHaveBeenCalledWith("t1", "Recursion revision"));
  });

  it("asks before deleting a chat, then removes it", async () => {
    vi.mocked(tutorApi.deleteThread).mockResolvedValue(undefined);
    render(<AppShell>content</AppShell>);
    await openHistory();
    await userEvent.click(await screen.findByRole("button", { name: "Options for Recursion basics" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(tutorApi.deleteThread).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Delete chat" }));
    await waitFor(() => expect(tutorApi.deleteThread).toHaveBeenCalledWith("t1"));
  });
});
