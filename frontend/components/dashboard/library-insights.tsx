"use client";

import {
  AlignLeft,
  BookOpen,
  Bookmark,
  ChevronRight,
  FileText,
  Globe,
  Lightbulb,
  ListChecks,
  Quote,
  Sparkles,
  Upload,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DocumentSource, DocumentUsage, HotPage } from "@/types/api";
import { cardLinkClass, DashCard, IconChip } from "./dash-card";

const SOURCE_ICON: Record<DocumentSource, LucideIcon> = { pdf: FileText, website: Globe, text: AlignLeft };
export const MAX_ROWS = 5;

/** Share of a document's pages that answers have cited, or null when page numbers are unknown. */
export function coveragePercent(doc: DocumentUsage): number | null {
  if (!doc.page_count) return null;
  return Math.min(100, Math.round((doc.pages_cited / doc.page_count) * 100));
}

/** Small borderless icon button with a tooltip, for secondary actions in a row. */
function IconAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-stone-100 hover:text-ink"
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  );
}

function DocRow({ doc }: { doc: DocumentUsage }) {
  const coverage = coveragePercent(doc);
  const used = doc.times_cited > 0;
  const meta = [doc.page_count ? `${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}` : null, used ? `${doc.times_cited} citations` : "Not explored yet"]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <IconChip icon={SOURCE_ICON[doc.source_type] ?? FileText} className="bg-stone-100 text-ink-2" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{doc.title}</p>
        <p className="truncate text-small text-ink-2">{meta}</p>
      </div>
      {coverage !== null ? (
        <div className="hidden w-32 shrink-0 items-center gap-2 sm:flex">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={coverage}
            aria-label={`${coverage}% of pages explored`}
          >
            <div className="h-full rounded-full bg-clay" style={{ width: `${coverage}%` }} />
          </div>
          <span className="w-9 text-right text-xs font-medium text-ink-2">{coverage}%</span>
        </div>
      ) : null}
      <div className="flex shrink-0">
        <IconAction href={`/tutor?mode=summary&doc=${doc.id}`} icon={Sparkles} label={`Summarise ${doc.title}`} />
        <IconAction href={`/tutor?mode=quiz&doc=${doc.id}`} icon={ListChecks} label={`Quiz me on ${doc.title}`} />
      </div>
    </li>
  );
}

/** Whole-library coverage, and the document to open next. Sits at the bottom so the card fills its row. */
function LibraryFooter({ documents, next }: { documents: DocumentUsage[]; next: DocumentUsage | null }) {
  const pages = documents.reduce((sum, d) => sum + (d.page_count ?? 0), 0);
  const cited = documents.reduce((sum, d) => sum + Math.min(d.pages_cited, d.page_count ?? 0), 0);
  const percent = pages > 0 ? Math.round((cited / pages) * 100) : 0;
  return (
    <div className="mt-auto flex flex-col gap-3 border-t border-stone pt-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-ink">Library explored</span>
          <span className="text-ink-2">
            {cited} of {pages} pages
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${percent}% of your library explored`}>
          <div className="h-full rounded-full bg-clay" style={{ width: `${percent}%` }} />
        </div>
      </div>
      {next ? (
        <Link href={`/tutor?mode=summary&doc=${next.id}`} className="flex min-w-0 items-center gap-1 text-sm font-medium text-accent-link hover:underline sm:max-w-[45%]">
          <span className="truncate">Start {next.title}</span>
          <ChevronRight size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** Ready documents, least explored first, with how much of each the tutor has drawn on. */
export function LibraryCard({ documents }: { documents: DocumentUsage[] }) {
  const sorted = [...documents].sort((a, b) => (coveragePercent(a) ?? 0) - (coveragePercent(b) ?? 0) || a.times_cited - b.times_cited);
  return (
    <DashCard
      title="Library"
      icon={BookOpen}
      action={
        <Link href="/library" className={cardLinkClass}>
          Manage
        </Link>
      }
    >
      <div className="mb-2 hidden justify-end pr-[4.5rem] text-xs text-ink-2 sm:flex">
        <span className="w-32">Pages explored</span>
      </div>
      <ul className="divide-y divide-stone">
        {sorted.slice(0, MAX_ROWS).map((doc) => (
          <DocRow key={doc.id} doc={doc} />
        ))}
      </ul>
      <LibraryFooter documents={documents} next={sorted.find((d) => d.times_cited === 0) ?? null} />
    </DashCard>
  );
}

/** The pages cited most often: the core of what the student is studying. */
export function TopPagesCard({ pages }: { pages: HotPage[] }) {
  const max = Math.max(1, ...pages.map((p) => p.times_cited));
  return (
    <DashCard title="Most cited pages" icon={Bookmark}>
      {pages.length === 0 ? (
        <p className="text-sm text-ink-2">Pages behind your answers appear here.</p>
      ) : (
        <ol className="divide-y divide-stone">
          {pages.map((page, i) => (
            <li key={`${page.document_id}-${page.page_number}`}>
              <Link
                href={`/tutor?mode=quiz&doc=${page.document_id}`}
                aria-label={`Page ${page.page_number} of ${page.document_title}, cited ${page.times_cited} ${page.times_cited === 1 ? "time" : "times"}. Quiz yourself on this document`}
                className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-stone-100"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-ink-2">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">Page {page.page_number}</span>
                  <span className="block truncate text-small text-ink-2">{page.document_title}</span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                    <span className="block h-full rounded-full bg-clay-300" style={{ width: `${(page.times_cited / max) * 100}%` }} />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-small font-medium text-ink-2">
                  <Quote size={12} strokeWidth={2} aria-hidden="true" />
                  {page.times_cited}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </DashCard>
  );
}

/** One click into each way of studying, scoped to the latest document when there is one. */
export function QuickActionsCard({ latestDocId, className }: { latestDocId: string | null; className?: string }) {
  const scope = latestDocId ? `&doc=${latestDocId}` : "";
  const actions = [
    { icon: Sparkles, title: "Summarise", hint: "Key ideas with pages", href: `/tutor?mode=summary${scope}` },
    { icon: ListChecks, title: "Quiz me", hint: "Find weak topics", href: `/tutor?mode=quiz${scope}` },
    { icon: Lightbulb, title: "Explain simply", hint: "Plain words", href: `/tutor?mode=simple${scope}` },
    { icon: Upload, title: "Add material", hint: "PDF, link or notes", href: "/library" },
  ];
  return (
    <DashCard title="Quick actions" icon={Zap} className={className}>
      <ul className="flex flex-1 flex-col gap-2">
        {actions.map(({ icon, title, hint, href }) => (
          <li key={title} className="flex flex-1">
            <Link
              href={href}
              className={cn("group flex flex-1 items-center gap-3 rounded-control border border-stone px-3 py-2.5 transition-colors", "hover:border-clay-300 hover:bg-clay-soft")}
            >
              <IconChip icon={icon} className="group-hover:bg-paper" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{title}</span>
                <span className="block truncate text-small text-ink-2">{hint}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}
