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
    ["0 questions on sorting", "sorting", 3], // the quiz service writes at least 3
    ["give me 10 more", null, 10], // no previous quiz: the whole material, never the topic "more"
    ["Quiz me on Deadlock", "Deadlock", 5],
  ])("reads %j as topic %j and %i questions", (text, topic, count) => {
    expect(parseQuizRequest(text)).toEqual({ topic, count });
  });

  const previous = { request: { topic: "whatsap agent", count: 5 }, quizId: "q1" };

  it.each([
    ["give me 10 more", 10],
    ["more", 5],
    ["another one", 5],
    ["10", 10],
    ["again please", 5],
  ])("continues the last quiz for the follow-up %j", (text, count) => {
    expect(parseQuizRequest(text, previous)).toEqual({ topic: "whatsap agent", count, excludeQuizId: "q1" });
  });

  it("starts a new quiz when the follow-up names a subject of its own", () => {
    expect(parseQuizRequest("5 more on pricing", previous)).toEqual({ topic: "pricing", count: 5 });
  });
});
