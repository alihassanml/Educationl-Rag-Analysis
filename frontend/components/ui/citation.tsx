import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PillProps = {
  marker: number;
  /** Shown in a hover/focus card: document title and page. */
  title?: string;
  page?: string;
  snippet?: string;
  onClick?: () => void;
};

/** `[1]` pill. The hover card appears on hover and keyboard focus; click opens the sources panel. */
export function CitationPill({ marker, title, page, snippet, onClick }: PillProps) {
  return (
    <span className="group relative inline-block align-baseline">
      <button
        type="button"
        onClick={onClick}
        aria-label={title ? `Source ${marker}: ${title}${page ? `, ${page}` : ""}` : `Source ${marker}`}
        className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-clay-soft px-1 text-xs font-medium text-clay-stronger hover:bg-clay-200"
      >
        [{marker}]
      </button>
      {title ? (
        <span
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 w-64 rounded-panel border border-stone bg-paper p-3 text-left text-small text-ink opacity-0 shadow-md transition-opacity duration-[180ms] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
        >
          <span className="block font-medium">{title}</span>
          {page ? <span className="block text-ink-2">{page}</span> : null}
          {snippet ? <span className="mt-1 line-clamp-2 block text-ink-2">{snippet}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

type SourceCardProps = {
  title: string;
  page: string;
  /** The matched passage is highlighted in clay-soft. */
  snippet?: string;
  marker?: number;
  active?: boolean;
  children?: ReactNode;
};

export function SourceCard({ title, page, snippet, marker, active, children }: SourceCardProps) {
  return (
    <article className={cn("rounded-panel border bg-paper p-4", active ? "border-clay" : "border-stone")}>
      <div className="flex items-start gap-3">
        <FileText size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-2" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {marker !== undefined ? <span className="mr-1.5 text-clay-stronger">[{marker}]</span> : null}
            {title}
          </p>
          <p className="text-small text-ink-2">{page}</p>
        </div>
      </div>
      {snippet ? <p className="mt-3 rounded-control bg-clay-soft px-3 py-2 text-small text-ink">{snippet}</p> : null}
      {children}
    </article>
  );
}
