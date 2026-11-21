import { describe, expect, it } from "vitest";
import { filterThreads, groupThreads } from "@/lib/thread-groups";

const NOW = new Date(2026, 10, 18, 15, 0, 0); // 18 Nov 2026, local time
const thread = (id: string, title: string, when: Date) => ({ id, title, created_at: when.toISOString(), updated_at: when.toISOString() });

describe("groupThreads", () => {
  it("groups by calendar day: Today, Yesterday, Previous 7 days, Older", () => {
    const threads = [
      thread("a", "this morning", new Date(2026, 10, 18, 0, 5)),
      thread("b", "yesterday late", new Date(2026, 10, 17, 23, 55)),
      thread("c", "five days ago", new Date(2026, 10, 13, 12)),
      thread("d", "seven days ago", new Date(2026, 10, 11, 9)),
      thread("e", "eight days ago", new Date(2026, 10, 10, 9)),
      thread("f", "last year", new Date(2025, 5, 1)),
    ];
    const groups = groupThreads(threads, NOW);
    expect(groups.map((g) => [g.label, g.threads.map((t) => t.id)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
      ["Previous 7 days", ["c", "d"]],
      ["Older", ["e", "f"]],
    ]);
  });

  it("leaves out empty groups and keeps the given order inside a group", () => {
    const groups = groupThreads([thread("x", "x", new Date(2026, 10, 18, 14)), thread("y", "y", new Date(2026, 10, 18, 9))], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].threads.map((t) => t.id)).toEqual(["x", "y"]);
  });

  it("treats a thread from the future (clock skew) as today", () => {
    expect(groupThreads([thread("z", "z", new Date(2026, 10, 19, 1))], NOW)[0].label).toBe("Today");
  });
});

describe("filterThreads", () => {
  it("filters by title, ignoring case and surrounding spaces", () => {
    const threads = [thread("a", "Recursion basics", NOW), thread("b", "Photosynthesis", NOW)];
    expect(filterThreads(threads, "  RECURS ").map((t) => t.id)).toEqual(["a"]);
    expect(filterThreads(threads, "").map((t) => t.id)).toEqual(["a", "b"]);
  });
});
