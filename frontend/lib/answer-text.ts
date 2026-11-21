export type AnswerSegment = { type: "text"; text: string } | { type: "cite"; marker: number };

/** Split an answer into paragraphs of text and citation markers. Only markers that are among the
 *  sources become citations; any other `[n]` is dropped and never shown as a citation. The text is
 *  always plain text, so nothing the model writes can inject markup. */
export function splitAnswer(text: string, validMarkers: number[]): AnswerSegment[][] {
  const valid = new Set(validMarkers);
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map((paragraph) => {
      const segments: AnswerSegment[] = [];
      const push = (segment: AnswerSegment) => {
        const last = segments[segments.length - 1];
        if (segment.type === "text" && last?.type === "text") last.text += segment.text;
        else segments.push(segment);
      };
      let from = 0;
      for (const match of paragraph.matchAll(/\[(\d+)\]/g)) {
        const marker = Number(match[1]);
        if (match.index > from) push({ type: "text", text: paragraph.slice(from, match.index) });
        if (valid.has(marker)) push({ type: "cite", marker });
        from = match.index + match[0].length;
      }
      if (from < paragraph.length) push({ type: "text", text: paragraph.slice(from) });
      return segments;
    });
}
