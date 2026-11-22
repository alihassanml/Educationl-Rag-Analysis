import { describe, expect, it } from "vitest";
import { parseQuizRequest } from "@/lib/quiz-request";

describe("parseQuizRequest", () => {
  it.each([
    ["quiz me all topic maximum 10 quiz", null, 10],
    ["Quiz me on the topics, with up to 10 questions.", null, 10],
    ["quiz me on recursion", "recursion", 5],
    ["give me 3 questions on binary search trees", "binary search trees", 3],
    ["recursion", "recursion", 5],
    ["quiz me on everything with 50 questions", null, 10],
    ["quiz me", null, 5],
    ["0 questions on sorting", "sorting", 1],
  ])("reads %j as topic %j and %i questions", (text, topic, count) => {
    expect(parseQuizRequest(text)).toEqual({ topic, count });
  });
});
