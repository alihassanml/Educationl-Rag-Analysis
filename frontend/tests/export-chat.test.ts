import { describe, expect, it } from "vitest";
import { chatToMarkdown } from "@/lib/export-chat";

describe("chatToMarkdown", () => {
  it("writes questions, answers and the sources they cite", () => {
    const md = chatToMarkdown("Recursion", [
      { question: "What is recursion?", answer: { text: "A function calling itself [1].", abstained: false, sources: [{ title: "Notes", page: 2 }, { title: "Site", page: null }] } },
    ]);
    expect(md).toContain("# Recursion");
    expect(md).toContain("## You\n\nWhat is recursion?");
    expect(md).toContain("A function calling itself [1].");
    expect(md).toContain("- Notes, page 2\n- Site");
  });

  it("labels the answer style, an abstained answer and a quiz", () => {
    const md = chatToMarkdown("", [
      { question: "x", mode: "summary", answer: { text: "", abstained: true, sources: [] } },
      { question: "quiz me", mode: "quiz", quiz: { topic: "recursion", count: 5 }, answer: null },
    ]);
    expect(md).toContain("# Study chat");
    expect(md).toContain("## You (Summarise)");
    expect(md).toContain("_Not found in your material._");
    expect(md).toContain("5-question quiz on recursion");
  });
});
