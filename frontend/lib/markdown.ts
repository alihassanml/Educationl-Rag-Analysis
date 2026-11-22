import { citeSegments, type AnswerSegment } from "./answer-text";

/** A small, safe markdown reader for tutor answers. It understands what the model actually writes:
 *  paragraphs, headings, bullet and numbered lists, code blocks, **bold**, *italic* and `code`.
 *  The output is data, never HTML, so React escapes every character the model wrote. */

export type Inline =
  | AnswerSegment
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string };

export type Block =
  | { type: "p"; inline: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] }
  | { type: "code"; text: string };

const INLINE = /`([^`\n]+)`|\*\*(\S(?:[^\n]*?\S)?)\*\*|(?<![*\w])\*(?![\s*])([^*\n]*?[^\s*])\*(?![*\w])/g;

export function parseInline(text: string, valid: Set<number>): Inline[] {
  const out: Inline[] = [];
  let from = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > from) out.push(...citeSegments(text.slice(from, match.index), valid));
    if (match[1] !== undefined) out.push({ type: "code", text: match[1] });
    else if (match[2] !== undefined) out.push({ type: "bold", children: parseInline(match[2], valid) });
    else out.push({ type: "italic", children: parseInline(match[3], valid) });
    from = match.index + match[0].length;
  }
  if (from < text.length) out.push(...citeSegments(text.slice(from), valid));
  return out;
}

const FENCE = /^\s*```/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseAnswer(text: string, validMarkers: number[]): Block[] {
  const valid = new Set(validMarkers);
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "p", inline: parseInline(paragraph.join("\n"), valid) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: list.type, items: list.items.map((item) => parseInline(item, valid)) });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) {
      flushParagraph();
      flushList();
      const code: string[] = [];
      // An unclosed fence is a block still being written: keep what has arrived
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: Math.min(heading[1].length, 3) as 1 | 2 | 3, inline: parseInline(heading[2].trim(), valid) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push(item[1].trim());
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`; // a wrapped list item
      continue;
    }
    flushList();
    paragraph.push(line.trimEnd());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** While text is still being revealed, hide a `**` or backtick that has not been closed yet, so the
 *  student never sees a stray `**` flash before the word it is about to make bold. */
export function hideOpenMarkup(text: string): string {
  const cut = (marker: string) => {
    const count = text.split(marker).length - 1;
    if (count % 2 === 1) text = text.slice(0, text.lastIndexOf(marker));
  };
  const fences = (text.match(/```/g) ?? []).length;
  if (fences % 2 === 1) return text; // inside a code block: everything is literal
  cut("**");
  cut("`");
  return text;
}
