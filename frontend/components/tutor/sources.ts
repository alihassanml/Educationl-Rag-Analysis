import type { Source } from "@/lib/chat-state";
import type { ChatCitation } from "@/types/api";

/** Saved citations to display sources. Markers are the ones the backend stored, never renumbered. */
export function toSources(citations: ChatCitation[]): Source[] {
  return citations.map((c) => ({
    marker: c.marker,
    chunkId: c.chunk_id,
    documentId: c.document_id,
    title: c.document_title,
    page: c.page_number,
    section: c.section_title ?? null,
    snippet: c.snippet,
    deleted: c.source_deleted,
  }));
}

/** "Chapter 3: Recursion · Page 45". Without a chapter this is just "Page 45", as before. */
export function pageText(page: number | null, section?: string | null): string {
  const where = page === null ? "Page not available" : `Page ${page}`;
  return section ? `${section} · ${where}` : where;
}
