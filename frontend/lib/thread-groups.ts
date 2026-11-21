import type { ThreadSummary } from "@/types/api";

export type ThreadGroup = { label: "Today" | "Yesterday" | "Previous 7 days" | "Older"; threads: ThreadSummary[] };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Group threads (already newest first) by calendar day in the student's local time. */
export function groupThreads(threads: ThreadSummary[], now: Date = new Date()): ThreadGroup[] {
  const today = startOfDay(now).getTime();
  const DAY = 86_400_000;
  const groups: ThreadGroup[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "Previous 7 days", threads: [] },
    { label: "Older", threads: [] },
  ];
  for (const thread of threads) {
    // Round, not floor: a day boundary can be 23 or 25 hours long across a clock change
    const daysAgo = Math.round((today - startOfDay(new Date(thread.updated_at)).getTime()) / DAY);
    const index = daysAgo <= 0 ? 0 : daysAgo === 1 ? 1 : daysAgo <= 7 ? 2 : 3;
    groups[index].threads.push(thread);
  }
  return groups.filter((g) => g.threads.length > 0);
}

export const filterThreads = (threads: ThreadSummary[], query: string): ThreadSummary[] => {
  const q = query.trim().toLowerCase();
  return q === "" ? threads : threads.filter((t) => t.title.toLowerCase().includes(q));
};
