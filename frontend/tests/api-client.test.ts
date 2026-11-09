import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "@/lib/api-client";

/** The ApiError a request rejects with (fails the test if it resolves). */
const rejection = (promise: Promise<unknown>): Promise<ApiError> =>
  promise.then(
    () => {
      throw new Error("expected the request to fail");
    },
    (e: unknown) => e as ApiError,
  );

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest", () => {
  it("returns parsed JSON and always sends credentials", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, json: async () => ({ id: 1 }) });
    await expect(apiRequest("/auth/me")).resolves.toEqual({ id: 1 });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include", method: "GET" });
  });

  it("returns undefined for 204 responses", async () => {
    mockFetch({ ok: true, status: 204 });
    await expect(apiRequest("/documents/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("turns the backend error shape into an ApiError with field details", async () => {
    mockFetch({
      ok: false,
      status: 422,
      json: async () => ({
        error: { code: "validation_error", message: "Some fields are invalid", details: [{ field: "email", message: "bad" }] },
      }),
    });
    const error = await rejection(apiRequest("/auth/register", { method: "POST", json: {} }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "validation_error", fields: [{ field: "email", message: "bad" }] });
  });

  it("never shows raw server output when the error body is not JSON", async () => {
    mockFetch({ ok: false, status: 500, json: async () => Promise.reject(new Error("<html>stack trace</html>")) });
    const error = await rejection(apiRequest("/documents"));
    expect(error.message).toBe("Something went wrong. Please try again.");
  });

  it("reports an unreachable server in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await rejection(apiRequest("/documents"));
    expect(error).toMatchObject({ code: "network_error", status: 0 });
    expect(error.message).toMatch(/Could not reach the server/);
  });

  it("sends FormData without setting a content type so the browser adds the multipart boundary", async () => {
    const fetchMock = mockFetch({ ok: true, status: 201, json: async () => ({}) });
    const formData = new FormData();
    formData.append("file", new File(["x"], "a.pdf"));
    await apiRequest("/documents", { method: "POST", formData });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(formData);
    expect(init.headers["Content-Type"]).toBeUndefined();
  });
});
