import { describe, expect, it } from "vitest";
import { createSseParser, readSse } from "@/lib/sse";

const wire = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("SSE parser", () => {
  it("returns several events that arrive in one chunk", () => {
    const parser = createSseParser();
    const events = parser.push(wire("status", { stage: "searching" }) + wire("token", { text: "Hi" }));
    expect(events).toEqual([
      { event: "status", data: { stage: "searching" } },
      { event: "token", data: { text: "Hi" } },
    ]);
  });

  it("waits for the rest of an event that is split across chunks, even mid-line", () => {
    const parser = createSseParser();
    const text = wire("sources", [{ marker: 1 }]) + wire("token", { text: "a b" });
    const seen = [];
    for (let i = 0; i < text.length; i += 7) seen.push(...parser.push(text.slice(i, i + 7)));
    expect(seen).toEqual([
      { event: "sources", data: [{ marker: 1 }] },
      { event: "token", data: { text: "a b" } },
    ]);
  });

  it("handles CRLF line endings, comments and multi-line data", () => {
    const parser = createSseParser();
    const events = parser.push(": ping\r\n\r\nevent: token\r\ndata: {\"text\":\r\ndata: \"x\"}\r\n\r\n");
    expect(events).toEqual([{ event: "token", data: { text: "x" } }]);
  });

  it("keeps non-JSON data as text and defaults the event name to message", () => {
    const events = createSseParser().push("data: plain words\n\n");
    expect(events).toEqual([{ event: "message", data: "plain words" }]);
  });

  it("reads a byte stream, including a multi-byte character cut in half", async () => {
    const bytes = new TextEncoder().encode(wire("token", { text: "é" }) + wire("done", {}));
    const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const events = [];
    for await (const event of readSse(stream)) events.push(event);
    expect(events).toEqual([
      { event: "token", data: { text: "é" } },
      { event: "done", data: {} },
    ]);
  });
});
