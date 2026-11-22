const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "just now". The full date belongs in a tooltip next to it. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** The date shown beside a chat in the history list: "2 days ago" for the last week, then "Nov 14"
 *  (with the year once it is from another year). */
export function formatChatDate(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  if (now - date.getTime() < 7 * 24 * 3600 * 1000) return formatRelative(iso, now);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}
