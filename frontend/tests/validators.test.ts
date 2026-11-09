import { describe, expect, it } from "vitest";
import { credentialsSchema, fieldErrors, validatePdf } from "@/lib/validators";

describe("credentialsSchema", () => {
  it("accepts a valid email and password", () => {
    expect(credentialsSchema.safeParse({ email: " a@b.com ", password: "password123" }).success).toBe(true);
  });

  it("reports one message per field", () => {
    const result = credentialsSchema.safeParse({ email: "nope", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        email: "Enter a valid email address",
        password: "Use at least 8 characters",
      });
    }
  });
});

describe("validatePdf", () => {
  const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

  it("accepts a PDF", () => expect(validatePdf(file("notes.PDF", 100))).toBeNull());
  it("rejects other extensions", () => expect(validatePdf(file("notes.docx", 100))).toMatch(/Only PDF/));
  it("rejects empty files", () => expect(validatePdf(file("a.pdf", 0))).toMatch(/empty/));
  it("rejects files over the size limit", () => expect(validatePdf(file("a.pdf", 21 * 1024 * 1024))).toMatch(/20 MB/));
});
