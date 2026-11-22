import { describe, expect, it } from "vitest";
import { formatChatDate } from "@/lib/relative-time";

const NOW = new Date("2026-11-22T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 24 * 3600 * 1000;

describe("formatChatDate", () => {
  it("is relative for the last week", () => {
    expect(formatChatDate(ago(2 * DAY), NOW)).toBe("2 days ago");
    expect(formatChatDate(ago(30_000), NOW)).toBe("just now");
  });
  it("is a short date after that, with the year only when it is another year", () => {
    expect(formatChatDate("2026-11-14T10:00:00Z", NOW)).toBe("Nov 14");
    expect(formatChatDate("2025-03-02T10:00:00Z", NOW)).toBe("Mar 2, 2025");
  });
});
