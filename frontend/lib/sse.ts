export type SseEvent = { event: string; data: unknown };

/** Incremental server-sent events parser. Feed it text as it arrives; it returns the events that
 *  are complete so far and keeps the rest. Handles several events per chunk, an event split across
 *  chunks, CRLF line endings, comment lines and multi-line data. */
export function createSseParser() {
  let buffer = "";

  function parseBlock(block: string): SseEvent | null {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line === "" || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length === 0) return null;
    const raw = data.join("\n");
    try {
      return { event, data: JSON.parse(raw) };
    } catch {
      return { event, data: raw };
    }
  }

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      const events: SseEvent[] = [];
      // Normalise line endings, then an event ends at a blank line
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r(?!$)/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const parsed = parseBlock(buffer.slice(0, end));
        if (parsed) events.push(parsed);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
      }
      return events;
    },
  };
}

/** Read a response body as server-sent events. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    yield* parser.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
