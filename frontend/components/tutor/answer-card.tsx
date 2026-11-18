"use client";

import { Copy, SearchX } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CitationPill } from "@/components/ui/citation";
import { useToast } from "@/components/ui/toast";
import { pageLabel } from "@/lib/formatters";
import type { AskResponse } from "@/types/api";
import { pageText, uniqueSources, type Source } from "./sources";

type Props = {
  response: AskResponse;
  onRephrase?: () => void;
  /** Opens the sources panel (or sheet) at this source. */
  onOpenSource?: (source: Source) => void;
};

/** The answer has no bubble (left-aligned body text). "Not found in your material" is a designed state, not an error. */
export function AnswerCard({ response, onRephrase, onOpenSource }: Props) {
  const toast = useToast();

  if (response.insufficient_evidence) {
    return (
      <div className="rounded-panel bg-stone-100 p-6">
        <SearchX size={24} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
        <h3 className="mt-3 text-lg font-semibold text-ink">Not found in your material</h3>
        <p className="mt-1 max-w-prose text-ink-2">
          Your uploaded documents don&apos;t cover this, so I won&apos;t guess. Try rephrasing, or upload a source that covers it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/library" variant="secondary">
            Upload a source
          </ButtonLink>
          <Button variant="ghost" onClick={onRephrase}>
            Rephrase
          </Button>
        </div>
      </div>
    );
  }

  const sources = uniqueSources(response.citations);

  async function copy() {
    const list = sources.map((s) => `- ${s.document_title}, ${pageLabel(s.page_number)}`).join("\n");
    try {
      await navigator.clipboard.writeText(sources.length > 0 ? `${response.answer}\n\nSources:\n${list}` : response.answer);
      toast.show("Answer copied");
    } catch {
      // Clipboard can be blocked; the answer stays selectable on screen
    }
  }

  return (
    <div>
      <p className="max-w-[720px] whitespace-pre-wrap text-base text-ink">{response.answer}</p>
      {sources.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Sources</p>
          <ul className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <li key={source.key} className="flex items-center gap-1 rounded-full border border-stone bg-paper py-0.5 pl-1 pr-3 text-small text-ink">
                <CitationPill marker={source.marker} title={source.document_title} page={pageText(source.page_number)} onClick={() => onOpenSource?.(source)} />
                <span>
                  {source.document_title}, {pageLabel(source.page_number)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-small text-ink-2">Sources show where the supporting passages came from. Check them yourself before relying on an answer</p>
        </div>
      ) : null}
      <div className="mt-3 flex gap-1">
        <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy answer">
          <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
          Copy
        </Button>
      </div>
    </div>
  );
}
