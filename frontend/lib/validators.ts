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
