import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth/auth-form";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/api";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", () => ({ authApi: { login: vi.fn(), register: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("AuthForm", () => {
  it("shows validation messages and does not call the API", async () => {
    render(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getAllByText("Use at least 8 characters").length).toBeGreaterThan(0);
    expect(authApi.register).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email")).toHaveValue("not-an-email");
  });

  it("signs in and goes to the chat", async () => {
    vi.mocked(authApi.login).mockResolvedValue({ id: "1", email: "a@b.com", is_admin: false, created_at: "" });
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authApi.login).toHaveBeenCalledWith("a@b.com", "password123");
    expect(replace).toHaveBeenCalledWith("/tutor");
  });

  it("shows the server message and keeps the typed values after a failure", async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError("Invalid email or password", 401, "invalid_credentials"));
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getByLabelText("Email")).toHaveValue("a@b.com");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("disables the button while the request is pending", async () => {
    vi.mocked(authApi.login).mockReturnValue(new Promise(() => undefined));
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: "Signing in" })).toBeDisabled();
  });

  it("shows and hides the password with an accessible toggle", async () => {
    render(<AuthForm mode="login" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});
