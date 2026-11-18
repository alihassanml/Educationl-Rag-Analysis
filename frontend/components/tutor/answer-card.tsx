import { BookMarked, SearchX } from "lucide-react";
import { pageLabel } from "@/lib/formatters";
import type { AskResponse } from "@/types/api";

export function AnswerCard({ response }: { response: AskResponse }) {
  if (response.insufficient_evidence) {
    return (
      <div className="flex gap-3 rounded-panel border border-warning/30 bg-paper p-4">
        <SearchX size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="font-medium">Not found in your material</p>
          <p className="mt-1 text-ink-2">{response.answer}</p>
        </div>
      </div>
    );
  }

  // One line per document and page, even if several passages came from the same page
  const sources = [...new Map(response.citations.map((c) => [`${c.document_id}:${c.page_number}`, c])).values()];

  return (
    <div className="rounded-panel border border-stone bg-paper p-5">
      <p className="whitespace-pre-wrap">{response.answer}</p>
      {sources.length > 0 ? (
        <div className="mt-4 border-t border-stone pt-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BookMarked size={16} aria-hidden="true" />
            Sources from your material
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {sources.map((c) => (
              <li key={`${c.document_id}:${c.page_number}`}>
                {c.document_title}, {pageLabel(c.page_number)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-2">
            Sources show where the supporting passages came from. Check them yourself before relying on an answer.
          </p>
        </div>
      ) : null}
    </div>
  );
}
