import { describe, expect, it } from "vitest";
import { splitAnswer } from "@/lib/answer-text";

describe("splitAnswer", () => {
  it("turns known markers into citations and keeps the text around them", () => {
    expect(splitAnswer("A method [1] that stops [2].", [1, 2])).toEqual([
      [
        { type: "text", text: "A method " },
        { type: "cite", marker: 1 },
        { type: "text", text: " that stops " },
        { type: "cite", marker: 2 },
        { type: "text", text: "." },
      ],
    ]);
  });

  it("drops markers that are not among the sources, never showing them as citations", () => {
    const [paragraph] = splitAnswer("True [1] and invented [4].", [1]);
    expect(paragraph.filter((s) => s.type === "cite")).toEqual([{ type: "cite", marker: 1 }]);
    expect(paragraph.map((s) => (s.type === "text" ? s.text : "")).join("")).toBe("True  and invented .");
  });

  it("splits paragraphs on blank lines and leaves other text alone", () => {
    expect(splitAnswer("One [1].\n\nTwo array[0] here", [1])).toHaveLength(2);
    const second = splitAnswer("One [1].\n\nTwo a[0] here", [1])[1];
    expect(second).toEqual([{ type: "text", text: "Two a here" }]);
  });

  it("never treats html as markup: it stays plain text", () => {
    expect(splitAnswer("<img src=x onerror=alert(1)>", [])).toEqual([[{ type: "text", text: "<img src=x onerror=alert(1)>" }]]);
  });

  it("returns nothing for an empty answer", () => {
    expect(splitAnswer("", [1])).toEqual([]);
  });

  it("understands the full-width brackets some models use, and lists such as [1, 2]", () => {
    const [paragraph] = splitAnswer("A stack overflow【1】 and more [1, 2] but not 【4】 or [2, 5].", [1, 2]);
    expect(paragraph.filter((s) => s.type === "cite")).toEqual([
      { type: "cite", marker: 1 },
      { type: "cite", marker: 1 },
      { type: "cite", marker: 2 },
      { type: "cite", marker: 2 },
    ]);
    const text = paragraph.map((s) => (s.type === "text" ? s.text : "")).join("");
    expect(text).not.toMatch(/[【】\[\]]|\b4\b|\b5\b/); // unknown numbers are dropped, never shown
  });
});
