// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

function request(path: string, signedIn: boolean): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: signedIn ? { cookie: "access_token=abc" } : {},
  });
}

const location = (response: Response) => response.headers.get("location");

describe("proxy", () => {
  it("lets everyone see the landing page", () => {
    expect(location(proxy(request("/", false)))).toBeNull();
    expect(location(proxy(request("/", true)))).toBeNull();
  });

  it("sends signed-out visitors from app pages to login", () => {
    expect(location(proxy(request("/dashboard", false)))).toBe("http://localhost:3000/login");
    expect(location(proxy(request("/tutor", false)))).toBe("http://localhost:3000/login");
  });

  it("sends signed-in users from auth pages to the chat, unless their session expired", () => {
    expect(location(proxy(request("/login", true)))).toBe("http://localhost:3000/tutor");
    expect(location(proxy(request("/login?expired=1", true)))).toBeNull();
  });

  it("does not gate the login page for signed-out visitors", () => {
    expect(location(proxy(request("/login", false)))).toBeNull();
  });

  it("never runs on API calls, which are forwarded to the backend as they are", () => {
    const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    expect(matches("/api/v1/auth/login")).toBe(false);
    expect(matches("/dashboard")).toBe(true);
  });
});
