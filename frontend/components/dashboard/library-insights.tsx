"use client";

import Link from "next/link";
import type { DocumentUsage } from "@/types/api";
import { cardLinkClass, DashCard } from "./dash-card";

export const MAX_ROWS = 4;

/** Share of a document's pages that answers have cited, or null when page numbers are unknown. */
export function coveragePercent(doc: DocumentUsage): number | null {
  if (!doc.page_count) return null;
  return Math.min(100, Math.round((doc.pages_cited / doc.page_count) * 100));
}

function DocRow({ doc }: { doc: DocumentUsage }) {
  const coverage = coveragePercent(doc);
  return (
    <li className="flex items-center gap-4 py-2.5">
      <Link href={`/tutor?doc=${doc.id}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-accent-link">
        {doc.title}
      </Link>
      {coverage !== null ? (
        <div className="flex w-28 shrink-0 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage} aria-label={`${coverage}% of ${doc.title} explored`}>
            <div className="h-full rounded-full bg-clay" style={{ width: `${coverage}%` }} />
          </div>
          <span className="w-9 text-right text-small text-ink-2">{coverage}%</span>
        </div>
      ) : null}
    </li>
  );
}

/** The documents the tutor has drawn on least come first, with how much of each has been explored. */
export function LibraryCard({ documents }: { documents: DocumentUsage[] }) {
  const sorted = [...documents].sort((a, b) => (coveragePercent(a) ?? 0) - (coveragePercent(b) ?? 0) || a.times_cited - b.times_cited);
  return (
    <DashCard
      title="Library"
      action={
        <Link href="/library" className={cardLinkClass}>
          Manage
        </Link>
      }
    >
      <ul className="divide-y divide-stone">
        {sorted.slice(0, MAX_ROWS).map((doc) => (
          <DocRow key={doc.id} doc={doc} />
        ))}
      </ul>
    </DashCard>
  );
}
