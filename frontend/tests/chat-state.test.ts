import { describe, expect, it } from "vitest";
import { applyEvent, initialLive, markStopped } from "@/lib/chat-state";

const source = { marker: 1, chunk_id: "c1", document_id: "d1", document_title: "Notes", page_number: 2, snippet: "Recursion is" };

describe("live answer state", () => {
  it("follows the event order: stage, sources first, then text, then done", () => {
    let live = initialLive();
    live = applyEvent(live, { event: "status", data: { stage: "rewriting" } });
    expect(live.stage).toBe("rewriting");
    live = applyEvent(live, { event: "status", data: { stage: "searching" } });
    live = applyEvent(live, { event: "sources", data: [source] });
    expect(live.sources).toEqual([{ marker: 1, chunkId: "c1", documentId: "d1", title: "Notes", page: 2, snippet: "Recursion is", deleted: false }]);
    expect(live.text).toBe("");
    live = applyEvent(live, { event: "status", data: { stage: "writing" } });
    live = applyEvent(live, { event: "token", data: { text: "A method " } });
    live = applyEvent(live, { event: "token", data: { text: "[1]." } });
    expect(live.text).toBe("A method [1].");
    expect(live.status).toBe("streaming");
    live = applyEvent(live, {
      event: "done",
      data: { message_id: "m1", abstained: false, standalone_query: "What is recursion?", rewrite_used: true, unknown_markers: [4], latency_ms: {} },
    });
    expect(live).toMatchObject({ status: "complete", messageId: "m1", standaloneQuery: "What is recursion?", rewriteUsed: true, unknownMarkers: [4], stage: null });
  });

  it("marks an abstained answer from the done event", () => {
    let live = applyEvent(initialLive(), { event: "sources", data: [] });
    live = applyEvent(live, { event: "done", data: { message_id: "m2", abstained: true, standalone_query: "q", rewrite_used: false, unknown_markers: [], latency_ms: {} } });
    expect(live).toMatchObject({ status: "complete", abstained: true });
  });

  it("keeps the partial text when an error arrives", () => {
    let live = applyEvent(initialLive(), { event: "token", data: { text: "Partial " } });
    live = applyEvent(live, { event: "error", data: { code: "provider_unavailable", message: "The AI service is busy right now" } });
    expect(live).toMatchObject({ status: "failed", text: "Partial ", error: "The AI service is busy right now", stage: null });
  });

  it("ignores events it does not know and malformed payloads", () => {
    const live = initialLive();
    expect(applyEvent(live, { event: "mystery", data: {} })).toBe(live);
    expect(applyEvent(live, { event: "token", data: null })).toBe(live);
    expect(applyEvent(live, { event: "sources", data: "nope" })).toBe(live);
  });

  it("keeps what was written when the student stops", () => {
    const live = markStopped(applyEvent(initialLive(), { event: "token", data: { text: "Half an answ" } }));
    expect(live).toMatchObject({ status: "stopped", text: "Half an answ", stage: null });
  });
});
