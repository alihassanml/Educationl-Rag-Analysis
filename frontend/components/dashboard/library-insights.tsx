"use client";

import { AlignLeft, ArrowRight, FileText, Globe, Lightbulb, ListChecks, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { formatRelative } from "@/lib/relative-time";
import type { DocumentSource, DocumentUsage, HotPage } from "@/types/api";

const SOURCE_ICON: Record<DocumentSource, typeof FileText> = { pdf: FileText, website: Globe, text: AlignLeft };
const MAX_DOCS = 5;

/** Share of a document's pages that answers have cited, or null when page numbers are unknown. */
export function coveragePercent(doc: DocumentUsage): number | null {
  if (!doc.page_count) return null;
  return Math.min(100, Math.round((doc.pages_cited / doc.page_count) * 100));
}

function DocRow({ doc }: { doc: DocumentUsage }) {
  const Icon = SOURCE_ICON[doc.source_type] ?? FileText;
  const coverage = coveragePercent(doc);
  const used = doc.times_cited > 0;
  const meta = [
    doc.page_count ? `${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}` : null,
    used ? `cited ${doc.times_cited} ${doc.times_cited === 1 ? "time" : "times"}` : null,
    doc.last_cited_at ? `last used ${formatRelative(doc.last_cited_at)}` : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-clay-soft text-accent-ink">
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-ink">{doc.title}</p>
            {!used ? <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">Not explored yet</span> : null}
          </div>
          <p className="text-small text-ink-2">{meta.length ? meta.join(" · ") : "Ready to study"}</p>
          {coverage !== null ? (
            <div className="mt-2 flex items-center gap-3">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={coverage}
                aria-label={`${coverage}% of pages explored`}
              >
                <div className="h-full rounded-full bg-clay" style={{ width: `${Math.max(coverage, used ? 4 : 0)}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs text-ink-2">{coverage}% explored</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 self-start sm:self-center">
        <ButtonLink size="sm" variant="secondary" href={`/tutor?mode=summary&doc=${doc.id}`}>
          Summarise
        </ButtonLink>
        <ButtonLink size="sm" variant="secondary" href={`/tutor?mode=quiz&doc=${doc.id}`}>
          Quiz me
        </ButtonLink>
      </div>
    </li>
  );
}

/** Every ready document with how much of it the tutor has actually drawn on. */
export function LibraryCoverage({ documents }: { documents: DocumentUsage[] }) {
  // Least explored first: that is where the gaps are
  const sorted = [...documents].sort((a, b) => (coveragePercent(a) ?? 0) - (coveragePercent(b) ?? 0) || a.times_cited - b.times_cited);
  const shown = sorted.slice(0, MAX_DOCS);
  const untouched = documents.filter((d) => d.times_cited === 0).length;

  return (
    <div>
      {untouched > 0 ? (
        <p className="mb-4 rounded-control bg-clay-soft px-4 py-3 text-sm text-accent-ink">
          {untouched === documents.length
            ? "You haven’t asked about any of your documents yet. Start with a summary to get the big picture."
            : `${untouched} of your ${documents.length} documents ${untouched === 1 ? "hasn’t" : "haven’t"} come up in a chat yet.`}
        </p>
      ) : null}
      <ul className="divide-y divide-stone">
        {shown.map((doc) => (
          <DocRow key={doc.id} doc={doc} />
        ))}
      </ul>
    </div>
  );
}

/** The pages cited most often: the core of what the student is studying. */
export function HotPages({ pages }: { pages: HotPage[] }) {
  if (pages.length === 0) {
    return <p className="text-ink-2">Ask the tutor a question and the pages behind its answers will show up here.</p>;
  }
  const max = Math.max(...pages.map((p) => p.times_cited));
  return (
    <ol className="space-y-1">
      {pages.map((page, i) => (
        <li key={`${page.document_id}-${page.page_number}`}>
          <Link
            href={`/tutor?mode=quiz&doc=${page.document_id}`}
            className="group -mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-stone-100"
            title="Quiz yourself on this document"
            aria-label={`Page ${page.page_number} of ${page.document_title}, cited ${page.times_cited} ${page.times_cited === 1 ? "time" : "times"}. Quiz yourself on this document`}
          >
            <span className="w-5 shrink-0 text-sm font-semibold text-ink-2">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium text-ink">
                  Page {page.page_number}
                  <span className="font-normal text-ink-2"> · {page.document_title}</span>
                </span>
                <span className="shrink-0 text-small text-ink-2">
                  {page.times_cited}×
                </span>
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <span className="block h-full rounded-full bg-clay-300" style={{ width: `${(page.times_cited / max) * 100}%` }} />
              </span>
            </span>
            <ArrowRight size={14} strokeWidth={1.75} className="shrink-0 text-ink-2 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** One click into each way of studying, scoped to the latest document when there is one. */
export function QuickActions({ latestDocId }: { latestDocId: string | null }) {
  const scope = latestDocId ? `&doc=${latestDocId}` : "";
  const actions = [
    { icon: Sparkles, title: "Summarise", hint: "The key ideas, with pages", href: `/tutor?mode=summary${scope}` },
    { icon: ListChecks, title: "Quiz me", hint: "Find your weak topics", href: `/tutor?mode=quiz${scope}` },
    { icon: Lightbulb, title: "Explain simply", hint: "Plain words, no jargon", href: `/tutor?mode=simple${scope}` },
    { icon: Upload, title: "Add material", hint: "PDF, link or notes", href: "/library" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3">
      {actions.map(({ icon: Icon, title, hint, href }) => (
        <li key={title}>
          <Link href={href} className="group flex h-full flex-col gap-3 rounded-panel border border-stone bg-paper p-4 transition-colors hover:border-clay hover:bg-clay-soft">
            <span className="flex size-9 items-center justify-center rounded-control bg-clay-soft text-accent-ink transition-colors group-hover:bg-paper">
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span>
              <span className="block font-medium text-ink">{title}</span>
              <span className="block text-small text-ink-2">{hint}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
