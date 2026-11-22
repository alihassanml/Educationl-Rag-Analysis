"use client";

import { Check, Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { CitationPill } from "@/components/ui/citation";
import { ErrorBlock } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { hideOpenMarkup, parseAnswer } from "@/lib/markdown";
import { useSmoothText } from "@/lib/use-smooth-text";
import type { LiveStage, Source } from "@/lib/chat-state";
import type { FeedbackRating, FeedbackReason } from "@/types/api";
import { AnswerMarkdown } from "./answer-markdown";
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
  /** Written in simpler words because the topic needs revision */
  simplified?: boolean;
  /** Answered in the style of the student's teacher material */
  teacherStyle?: boolean;
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
  // Text appears a few characters at a time as it arrives. A saved answer shows at once.
  const { shown, done: revealed } = useSmoothText(answer.text, streaming, answer.status === "stopped" || answer.status === "failed");
  const writing = streaming || !revealed;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (answer.abstained && answer.status === "complete") {
    return (
      <div className="rounded-panel bg-stone-100 p-6">
        <h3 className="text-base font-semibold text-ink">Not found in your material</h3>
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

  const validMarkers = answer.sources.map((s) => s.marker);
  const byMarker = new Map(answer.sources.map((s) => [s.marker, s]));
  // While text is still being revealed, an unclosed ** or ` stays hidden until its partner arrives
  const blocks = parseAnswer(writing ? hideOpenMarkup(shown) : shown, validMarkers);

  async function copy() {
    const list = answer.sources.map((s) => `- ${s.title}, ${pageText(s.page, s.section, s.startSeconds)}`).join("\n");
    try {
      await navigator.clipboard.writeText(answer.sources.length > 0 ? `${answer.text}\n\nSources:\n${list}` : answer.text);
      toast.show("Answer copied");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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
        <div className="mb-3">
          <button
            type="button"
            aria-expanded={sourcesOpen}
            aria-controls="answer-sources"
            onClick={() => setSourcesOpen((open) => !open)}
            className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-2 transition-colors duration-[120ms] hover:bg-stone-100 hover:text-ink"
          >
            {answer.sources.length === 1 ? "1 source" : `${answer.sources.length} sources`}
          </button>
          {sourcesOpen ? (
            <ul id="answer-sources" aria-label="Sources for this answer" className="mt-1 flex flex-col">
              {answer.sources.map((source) => (
                <li key={source.marker}>
                  <button
                    type="button"
                    onClick={() => onOpenSource?.(source)}
                    className="-ml-2 flex w-full max-w-[720px] items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-small text-ink hover:bg-stone-100"
                  >
                    <span className="font-medium text-accent-ink">[{source.marker}]</span>
                    <span className="truncate">{source.title}</span>
                    <span className="ml-auto shrink-0 text-ink-2">{source.deleted ? "Source deleted" : pageText(source.page, source.section, source.startSeconds)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {blocks.length > 0 ? (
        <AnswerMarkdown
          blocks={blocks}
          cite={(marker, key) => (
            <CitationPill
              key={key}
              marker={marker}
              title={byMarker.get(marker)?.title}
              page={pageText(byMarker.get(marker)?.page ?? null, byMarker.get(marker)?.section, byMarker.get(marker)?.startSeconds)}
              snippet={byMarker.get(marker)?.snippet}
              onClick={() => {
                const source = byMarker.get(marker);
                if (source) onOpenSource?.(source);
              }}
            />
          )}
          cursor={
            writing ? (
              <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-ink motion-reduce:animate-none" />
            ) : null
          }
        />
      ) : null}

      {answer.teacherStyle && answer.status === "complete" ? (
        <div className="mt-3 flex flex-col gap-1">
          <div>
            <Chip tone="clay">In your teacher&apos;s style</Chip>
          </div>
          {answer.sources.some((s) => s.isTeacher) ? (
            <p className="text-small text-ink-2">
              Teacher sources:{" "}
              {answer.sources
                .filter((s) => s.isTeacher)
                .map((s) => `${s.title}, ${pageText(s.page, s.section, s.startSeconds).toLowerCase()}`)
                .join("; ")}
            </p>
          ) : (
            <p className="text-small text-ink-2">No teacher material matched this question, so the answer uses your other sources.</p>
          )}
        </div>
      ) : null}

      {answer.simplified && answer.status === "complete" ? (
        <p className="mt-2 text-small text-ink-2">Explained more simply because this topic needs revision.</p>
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

      {(answer.status === "complete" || answer.status === "stopped") && revealed ? (
        <div className="msg-in -ml-2 mt-2 flex items-center">
          <IconButton label="Copy answer" onClick={copy}>
            {copied ? <Check size={16} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.75} aria-hidden="true" />}
          </IconButton>
          {onAskAgain ? (
            <IconButton label="Ask again" onClick={onAskAgain}>
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          ) : null}
          {answer.id && onFeedback ? <FeedbackButtons value={answer.feedback ?? null} onRate={onFeedback} /> : null}
        </div>
      ) : null}
    </div>
  );
}
