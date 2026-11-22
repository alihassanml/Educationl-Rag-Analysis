import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { HistoryPage } from "@/components/layout/history-page";
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
  notificationsApi: { list: vi.fn().mockResolvedValue({ notifications: [], unread_count: 0 }), markRead: vi.fn(), markAllRead: vi.fn() },
}));

const thread = (id: string, title: string): ThreadSummary => ({ id, title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
const rail = () => screen.getAllByRole("navigation", { name: "Main" })[0];

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
  it("is a slim set of labelled icons with no search box or chat list", () => {
    render(<AppShell>content</AppShell>);
    expect(within(rail()).getByRole("button", { name: "New chat" })).toBeInTheDocument();
    for (const name of ["Dashboard", "My library", "Progress", "Chat history"]) expect(within(rail()).getByRole("link", { name })).toBeInTheDocument();
    expect(within(rail()).getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Study tutor" })).not.toBeInTheDocument(); // the + button is the tutor
    expect(within(rail()).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(rail()).queryByRole("button", { name: "Search chats" })).not.toBeInTheDocument();
    expect(tutorApi.threads).not.toHaveBeenCalled(); // no recent chats in the sidebar
  });

  it("links Chat history to its own page, marked when it is open", () => {
    const { unmount } = render(<AppShell>content</AppShell>);
    expect(within(rail()).getByRole("link", { name: "Chat history" })).toHaveAttribute("href", "/history");
    expect(within(rail()).getByRole("link", { name: "Chat history" })).not.toHaveAttribute("aria-current");
    unmount();
    pathname = "/history";
    render(<AppShell>content</AppShell>);
    expect(within(rail()).getByRole("link", { name: "Chat history" })).toHaveAttribute("aria-current", "page");
    // The small-screen top bar opens the same page
    expect(screen.getAllByRole("link", { name: "Chat history" }).at(-1)).toHaveAttribute("href", "/history");
  });

  it("is always open, with the names beside the icons and no hover state", () => {
    render(<AppShell>content</AppShell>);
    const aside = rail().closest("aside")!;
    expect(aside.className).toContain("w-[240px]");
    for (const name of ["New chat", "Dashboard", "My library", "Progress", "Chat history"]) expect(within(rail()).getByText(name).className).toContain("visible opacity-100");

    fireEvent.mouseLeave(aside);
    expect(aside.className).toContain("w-[240px]");
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

describe("history page", () => {
  it("lists every chat under one search bar, with no filters or tabs", async () => {
    render(<HistoryPage />);
    expect(screen.getByRole("heading", { name: "Chats" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search chats" })).toHaveFocus();
    expect(await screen.findByRole("link", { name: /Recursion basics/ })).toHaveAttribute("href", "/tutor/t1");
    expect(screen.getAllByText("just now")).toHaveLength(2); // a date sits beside each title
    for (const text of ["Active", "Shared", "Archived", "Today"]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("filters as you type, can be cleared, and says when nothing matches", async () => {
    render(<HistoryPage />);
    await screen.findByRole("link", { name: /Recursion basics/ });
    const box = screen.getByRole("searchbox", { name: "Search chats" });
    await userEvent.type(box, "photo");
    expect(screen.queryByText("Recursion basics")).not.toBeInTheDocument();
    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, "zzz");
    expect(screen.getByText("No chats match “zzz”")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box).toHaveValue("");
    expect(screen.getByText("Recursion basics")).toBeInTheDocument();
  });

  it("says how to start when there are no chats yet", async () => {
    vi.mocked(tutorApi.threads).mockResolvedValue([]);
    render(<HistoryPage />);
    expect(await screen.findByText(/Your chats are saved here/)).toBeInTheDocument();
  });

  it("renames a chat in place", async () => {
    vi.mocked(tutorApi.renameThread).mockResolvedValue(thread("t1", "Recursion revision"));
    render(<HistoryPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Options for Recursion basics" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Chat title" });
    await userEvent.clear(input);
    await userEvent.type(input, "Recursion revision{Enter}");
    await waitFor(() => expect(tutorApi.renameThread).toHaveBeenCalledWith("t1", "Recursion revision"));
  });

  it("asks before deleting a chat, then removes it", async () => {
    vi.mocked(tutorApi.deleteThread).mockResolvedValue(undefined);
    render(<HistoryPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Options for Recursion basics" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(tutorApi.deleteThread).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Delete chat" }));
    await waitFor(() => expect(tutorApi.deleteThread).toHaveBeenCalledWith("t1"));
  });
});
