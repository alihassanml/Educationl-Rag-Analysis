import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/auth/session-provider", () => ({
  useUser: () => ({ id: "1", email: "student@example.com", created_at: "2026-01-01" }),
}));

describe("AppShell", () => {
  it("marks the current page in the navigation", () => {
    render(<AppShell>content</AppShell>);
    const links = screen.getAllByRole("link", { name: "Dashboard" });
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("toggles the mobile menu with correct aria state", async () => {
    render(<AppShell>content</AppShell>);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "Dashboard" })).toHaveLength(2);

    await userEvent.click(screen.getAllByRole("link", { name: "Dashboard" })[1]);
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
