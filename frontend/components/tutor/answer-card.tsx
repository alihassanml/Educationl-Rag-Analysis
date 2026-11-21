"use client";

import { Copy, RotateCcw, SearchX } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CitationPill } from "@/components/ui/citation";
import { ErrorBlock } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { splitAnswer } from "@/lib/answer-text";
import type { LiveStage, Source } from "@/lib/chat-state";
import type { FeedbackRating, FeedbackReason } from "@/types/api";
import { FeedbackButtons } from "./feedback-buttons";
import { pageText } from "./sources";

export type AnswerView = {
  /** Saved message id. Feedback needs it, so it is missing until the answer is saved. */
  id?: string;
  text: string;
  status: "streaming" | "complete" | "stopped" | "failed";
  stage: LiveStage | null;
  sources: Source[];
  abstained: boolean;
  error?: string;
  feedback?: FeedbackRating | null;
};

type Props = {
  answer: AnswerView;
  onRephrase?: () => void;
  /** Opens the sources panel (or sheet) at this source. */
  onOpenSource?: (source: Source) => void;
  onRetry?: () => void;
  onAskAgain?: () => void;
  onFeedback?: (rating: FeedbackRating, reason?: FeedbackReason) => void;
};

// Real stages only: these match the events the server actually sends
const STAGE_LABEL: Record<LiveStage, string> = {
  rewriting: "Understanding your follow-up",
  searching: "Searching your material",
  writing: "Writing answer",
};

/** The answer has no bubble. Sources appear above the text as soon as they arrive, and markers in the
 *  text become citation pills only when they match a source. "Not found" is a designed state, not an error. */
export function AnswerBlock({ answer, onRephrase, onOpenSource, onRetry, onAskAgain, onFeedback }: Props) {
  const toast = useToast();
  const streaming = answer.status === "streaming";

  if (answer.abstained && answer.status === "complete") {
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
          {onAskAgain ? (
            <Button variant="ghost" onClick={onAskAgain}>
              Ask again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const paragraphs = splitAnswer(
    answer.text,
    answer.sources.map((s) => s.marker),
  );
  const byMarker = new Map(answer.sources.map((s) => [s.marker, s]));

  async function copy() {
    const list = answer.sources.map((s) => `- ${s.title}, ${pageText(s.page).toLowerCase()}`).join("\n");
    try {
      await navigator.clipboard.writeText(answer.sources.length > 0 ? `${answer.text}\n\nSources:\n${list}` : answer.text);
      toast.show("Answer copied");
    } catch {
      // Clipboard can be blocked; the answer stays selectable on screen
    }
  }

  return (
    <div aria-busy={streaming}>
      {streaming && answer.stage ? (
        <p role="status" className="mb-3 text-small text-ink-2">
          {STAGE_LABEL[answer.stage]}
        </p>
      ) : null}

      {answer.sources.length > 0 ? (
        <ul aria-label="Sources for this answer" className="mb-4 flex flex-wrap gap-2">
          {answer.sources.map((source) => (
            <li key={source.marker}>
              <button
                type="button"
                onClick={() => onOpenSource?.(source)}
                className="flex max-w-full items-center gap-2 rounded-control border border-stone bg-paper px-3 py-1.5 text-left text-small text-ink hover:bg-stone-100"
              >
                <span className="font-medium text-clay-stronger">[{source.marker}]</span>
                <span className="truncate">{source.title}</span>
                <span className="shrink-0 text-ink-2">{source.deleted ? "Source deleted" : pageText(source.page)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {paragraphs.length > 0 ? (
        <div className="flex max-w-[720px] flex-col gap-3 text-base text-ink">
          {paragraphs.map((segments, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {segments.map((segment, j) =>
                segment.type === "text" ? (
                  segment.text
                ) : (
                  <CitationPill
                    key={j}
                    marker={segment.marker}
                    title={byMarker.get(segment.marker)?.title}
                    page={pageText(byMarker.get(segment.marker)?.page ?? null)}
                    snippet={byMarker.get(segment.marker)?.snippet}
                    onClick={() => {
                      const source = byMarker.get(segment.marker);
                      if (source) onOpenSource?.(source);
                    }}
                  />
                ),
              )}
              {streaming && i === paragraphs.length - 1 ? (
                <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-ink motion-reduce:animate-none" />
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

      {answer.status === "stopped" ? (
        <div className="mt-3">
          <Chip>Stopped</Chip>
        </div>
      ) : null}
      {answer.status === "failed" ? (
        <div className="mt-3">
          <ErrorBlock message={answer.error ?? "Something went wrong. Please try again."} onRetry={onRetry} />
        </div>
      ) : null}

      {answer.status === "complete" || answer.status === "stopped" ? (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy answer">
            <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
            Copy
          </Button>
          {onAskAgain ? (
            <Button variant="ghost" size="sm" onClick={onAskAgain}>
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
              Ask again
            </Button>
          ) : null}
          {answer.id && onFeedback ? <FeedbackButtons value={answer.feedback ?? null} onRate={onFeedback} /> : null}
        </div>
      ) : null}
      {answer.status === "complete" && answer.sources.length > 0 ? (
        <p className="mt-3 text-small text-ink-2">Sources show where the supporting passages came from. Check them yourself before relying on an answer</p>
      ) : null}
    </div>
  );
}
