import type { Citation } from "@/types/api";

export type Source = { marker: number; key: string; document_id: string; document_title: string; page_number: number | null };

/** One source per document page, numbered in the order the backend returned them. Citation data comes
 *  from the API only; nothing is parsed out of the model's text. */
export function uniqueSources(citations: Citation[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const c of citations) {
    const key = `${c.document_id}:${c.page_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ marker: sources.length + 1, key, document_id: c.document_id, document_title: c.document_title, page_number: c.page_number });
  }
  return sources;
}

export const pageText = (page: number | null) => (page === null ? "Page not available" : `Page ${page}`);
