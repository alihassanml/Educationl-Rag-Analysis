// [1], 【1】 (some models use full-width brackets) and lists such as [1, 2]
const MARKER = /[[【]\s*(\d+(?:\s*,\s*\d+)*)\s*[\]】]/g;

export type AnswerSegment = { type: "text"; text: string } | { type: "cite"; marker: number };

/** Split text into plain text and citation markers. Only markers that are among the sources become
 *  citations; any other `[n]` is dropped and never shown as a citation. */
export function citeSegments(text: string, validMarkers: number[] | Set<number>): AnswerSegment[] {
  const valid = validMarkers instanceof Set ? validMarkers : new Set(validMarkers);
  const segments: AnswerSegment[] = [];
  const push = (segment: AnswerSegment) => {
    const last = segments[segments.length - 1];
    if (segment.type === "text" && last?.type === "text") last.text += segment.text;
    else segments.push(segment);
  };
  let from = 0;
  for (const match of text.matchAll(MARKER)) {
    if (match.index > from) push({ type: "text", text: text.slice(from, match.index) });
    for (const number of match[1].split(",")) {
      const marker = Number(number);
      if (valid.has(marker)) push({ type: "cite", marker });
    }
    from = match.index + match[0].length;
  }
  if (from < text.length) push({ type: "text", text: text.slice(from) });
  return segments;
}

/** Split an answer into paragraphs of text and citation markers. The text is always plain text,
 *  so nothing the model writes can inject markup. */
export function splitAnswer(text: string, validMarkers: number[]): AnswerSegment[][] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map((paragraph) => citeSegments(paragraph, validMarkers));
}
