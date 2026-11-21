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
    snippet: c.snippet,
    deleted: c.source_deleted,
  }));
}

export const pageText = (page: number | null) => (page === null ? "Page not available" : `Page ${page}`);
