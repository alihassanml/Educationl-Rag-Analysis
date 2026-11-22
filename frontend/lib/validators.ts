import { z } from "zod";
import type { FieldError } from "./api-client";

export const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128, "Use 128 characters or fewer"),
});

export const MAX_UPLOAD_MB = 20;

export function validatePdf(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are supported";
  if (file.size === 0) return "This file is empty";
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `Files must be ${MAX_UPLOAD_MB} MB or smaller`;
  return null;
}

export const MIN_TEXT_CHARS = 30;
export const MAX_TEXT_CHARS = 200_000;

/** The address a student pasted, tidied up, or null if it is not a web address. Adds https:// when
 *  they typed "example.com/notes" without it. */
export function parseWebAddress(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True when the whole message is just a link, so the chat can offer to add it as a source. */
export function isLoneLink(text: string): boolean {
  const raw = text.trim();
  return /^https?:\/\/\S+$/i.test(raw) && parseWebAddress(raw) !== null;
}

export function validateLink(input: string): string | null {
  return parseWebAddress(input) ? null : "Enter a web address, like https://example.com/notes.pdf";
}

export function validateText(title: string, text: string): string | null {
  if (!title.trim()) return "Give this text a title";
  if (text.trim().length < MIN_TEXT_CHARS) return `Add a little more text (at least ${MIN_TEXT_CHARS} characters)`;
  if (text.length > MAX_TEXT_CHARS) return `Text must be ${MAX_TEXT_CHARS.toLocaleString("en")} characters or fewer`;
  return null;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

export function serverFieldErrors(fields: FieldError[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.field, f.message]));
}
