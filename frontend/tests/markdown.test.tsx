import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerBlock } from "@/components/tutor/answer-card";
import { hideOpenMarkup, parseAnswer, parseInline } from "@/lib/markdown";
import { useSmoothText } from "@/lib/use-smooth-text";

describe("parseAnswer", () => {
  it("reads bold, italic and code, with citations kept inside them", () => {
    const [block] = parseAnswer("The **key idea [1]** is `call.completed` and *only* that.", [1]);
    expect(block).toEqual({
      type: "p",
      inline: [
        { type: "text", text: "The " },
        { type: "bold", children: [{ type: "text", text: "key idea " }, { type: "cite", marker: 1 }] },
        { type: "text", text: " is " },
        { type: "code", text: "call.completed" },
        { type: "text", text: " and " },
        { type: "italic", children: [{ type: "text", text: "only" }] },
        { type: "text", text: " that." },
      ],
    });
  });

  it("reads headings, bullet lists and numbered lists, including wrapped items", () => {
    const blocks = parseAnswer("## Steps\n\n1. First\n2. Second\n   continues here\n\n- one\n- two\n\nDone.", []);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "ol", "ul", "p"]);
    expect(blocks[1]).toMatchObject({ items: [[{ type: "text", text: "First" }], [{ type: "text", text: "Second continues here" }]] });
  });

  it("keeps an unfinished code fence as a code block", () => {
    expect(parseAnswer("```js\nconst a = 1;", [])).toEqual([{ type: "code", text: "const a = 1;" }]);
  });

  it("never turns text into markup: tags stay as literal text", () => {
    const [block] = parseAnswer("<img src=x onerror=alert(1)> **bold**", []);
    expect(block).toMatchObject({ type: "p" });
    const inline = (block as { inline: { type: string; text?: string }[] }).inline;
    expect(inline[0]).toEqual({ type: "text", text: "<img src=x onerror=alert(1)> " });
  });

  it("does not treat a lone asterisk or snake_case as formatting", () => {
    expect(parseInline("2 * 3 = 6 and my_var_name", new Set())).toEqual([{ type: "text", text: "2 * 3 = 6 and my_var_name" }]);
  });

  it("drops citation numbers that are not sources", () => {
    const [block] = parseAnswer("True [1] and invented [4].", [1]);
    expect(JSON.stringify(block)).not.toContain('"marker":4');
  });
});

describe("hideOpenMarkup", () => {
  it("hides a bold or code marker that has not been closed yet", () => {
    expect(hideOpenMarkup("This is **conf")).toBe("This is ");
    expect(hideOpenMarkup("Use `call.com")).toBe("Use ");
    expect(hideOpenMarkup("A **done** and `ok`")).toBe("A **done** and `ok`");
  });
  it("leaves code blocks alone", () => {
    expect(hideOpenMarkup("```\na ** b")).toBe("```\na ** b");
  });
});

describe("AnswerBlock markdown", () => {
  const base = { text: "", status: "complete" as const, stage: null, sources: [], abstained: false };

  it("renders bold, lists and code as elements, not as asterisks", () => {
    render(<AnswerBlock answer={{ ...base, text: "The **conflicting** events:\n\n- `call.completed`\n- `tool.called`" }} />);
    expect(screen.getByText("conflicting").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("call.completed").tagName).toBe("CODE");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });
});

describe("useSmoothText", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  });
  afterEach(() => vi.useRealTimers());

  it("shows saved text at once", () => {
    const { result } = renderHook(() => useSmoothText("Already written", false));
    expect(result.current).toEqual({ shown: "Already written", done: true });
  });

  it("reveals streamed text gradually and then finishes", () => {
    const text = "A fairly long streamed answer that arrives in one burst.";
    const { result } = renderHook(() => useSmoothText(text, true));
    expect(result.current.shown).toBe("");
    act(() => void vi.advanceTimersByTime(32));
    expect(result.current.shown.length).toBeGreaterThan(0);
    expect(result.current.shown.length).toBeLessThan(text.length);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toEqual({ shown: text, done: true });
  });

  it("shows everything straight away when instant", () => {
    const { result } = renderHook(() => useSmoothText("Stopped here", true, true));
    expect(result.current.done).toBe(true);
  });
});
