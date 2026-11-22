export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pageLabel(page: number | null): string {
  return page === null ? "page not available" : `page ${page}`;
}

/** "Notes, Chapter 3: Recursion, page 45". The chapter is left out when there is none. */
export function sourceLabel(s: { document_title: string; page_number: number | null; section_title?: string | null }): string {
  return [s.document_title, s.section_title, pageLabel(s.page_number)].filter(Boolean).join(", ");
}
