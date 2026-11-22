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

/** Seconds as a video time: 754 is "12:34", 3725 is "1:02:05". */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "page 3", "pages 3 to 6", or an empty string when the source has no pages. */
export function pagesLabel(first: number | null, last: number | null): string {
  if (first === null) return "";
  return last !== null && last > first ? `pages ${first} to ${last}` : `page ${first}`;
}

/** "Notes, Chapter 3: Recursion, page 45". The chapter is left out when there is none. */
export function sourceLabel(s: { document_title: string; page_number: number | null; section_title?: string | null; start_seconds?: number | null }): string {
  // A lecture is cited by time, not page
  const where = s.start_seconds !== undefined && s.start_seconds !== null ? formatTimestamp(s.start_seconds) : pageLabel(s.page_number);
  return [s.document_title, s.section_title, where].filter(Boolean).join(", ");
}
