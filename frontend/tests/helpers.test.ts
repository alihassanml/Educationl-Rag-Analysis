import { describe, expect, it } from "vitest";
import { greetingFor } from "@/lib/greeting";
import { formatRelative } from "@/lib/relative-time";

describe("greetingFor", () => {
  it("follows the local hour", () => {
    expect(greetingFor(0)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });
});

describe("formatRelative", () => {
  const now = Date.UTC(2026, 10, 18, 12, 0, 0);
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("describes recent and older times in plain words", () => {
    expect(formatRelative(ago(10), now)).toBe("just now");
    expect(formatRelative(ago(5 * 60), now)).toBe("5 minutes ago");
    expect(formatRelative(ago(3 * 3600), now)).toBe("3 hours ago");
    expect(formatRelative(ago(24 * 3600), now)).toBe("yesterday");
    expect(formatRelative(ago(3 * 24 * 3600), now)).toBe("3 days ago");
  });
});

describe("chapter-aware citations", () => {
  it("puts the chapter before the page, and keeps the old format without one", async () => {
    const { pageText } = await import("@/components/tutor/sources");
    expect(pageText(45, "Chapter 3: Recursion")).toBe("Chapter 3: Recursion · Page 45");
    expect(pageText(45)).toBe("Page 45");
    expect(pageText(45, null)).toBe("Page 45");
    expect(pageText(null, "Chapter 3")).toBe("Chapter 3 · Page not available");
  });

  it("labels quiz sources with the chapter when there is one", async () => {
    const { sourceLabel } = await import("@/lib/formatters");
    expect(sourceLabel({ document_title: "Notes", page_number: 4, section_title: "Chapter 2" })).toBe("Notes, Chapter 2, page 4");
    expect(sourceLabel({ document_title: "Notes", page_number: 4 })).toBe("Notes, page 4");
  });
});
