const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

function redirectToLogin(): void {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  // Clear the stale cookie first, otherwise the login page would bounce straight back.
  fetch(`${BASE_URL}/auth/logout`, { method: "POST", credentials: "include" })
    .catch(() => undefined)
    // A full page load is deliberate here: it discards all client state of the ended session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    .finally(() => window.location.assign("/login?expired=1"));
}

async function failFromResponse(response: Response, path: string): Promise<never> {
  const payload = await response.json().catch(() => null);
  const error = payload?.error;
  if (response.status === 401 && !path.startsWith("/auth/")) redirectToLogin();
  throw new ApiError(
    error?.message ?? "Something went wrong. Please try again.",
    response.status,
    error?.code ?? "unknown_error",
    Array.isArray(error?.details) ? error.details : [],
  );
}

const networkError = () => new ApiError("Could not reach the server. Check your connection and try again.", 0, "network_error");

/** POST JSON and return the response so the caller can read its body as a stream. Errors that arrive
 *  before streaming starts (404, 422, 401) are thrown as ApiError, like any other request. */
export async function apiStream(path: string, json: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(json),
      signal,
      credentials: "include",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }
  if (!response.ok) return failFromResponse(response, path);
  if (!response.body) throw networkError();
  return response;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", json, formData, signal } = options;
  const headers: HeadersInit = {};
  let body: BodyInit | undefined;
  if (formData) {
    body = formData; // the browser sets the multipart boundary itself
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body, signal, credentials: "include" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }

  if (response.status === 204) return undefined as T;
  if (!response.ok) return failFromResponse(response, path);
  return (await response.json().catch(() => null)) as T;
}
