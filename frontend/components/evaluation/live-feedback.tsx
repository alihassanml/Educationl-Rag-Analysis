"use client";

import { Chip } from "@/components/ui/chip";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { FlatSection } from "@/components/ui/flat-section";
import { tutorApi } from "@/lib/api";
import { formatDateTime } from "@/lib/formatters";
import { useApi } from "@/lib/use-api";
import type { FeedbackReason } from "@/types/api";

const REASON_LABEL: Record<FeedbackReason, string> = {
  wrong: "Wrong",
  missing_source: "Missing source",
  unclear: "Not clear",
};

/** Recent thumbs up and down from the study tutor, for administrators. It shows the question and the
 *  answer but not who asked. The rating is always spelled out, never colour alone. */
export function LiveFeedback() {
  const feedback = useApi(tutorApi.recentFeedback);
  const items = feedback.data ?? [];

  return (
    <FlatSection title="Live feedback">
      {feedback.loading ? <LoadingBlock label="Loading feedback" /> : null}
      {feedback.error ? <ErrorBlock message={feedback.error.message} onRetry={feedback.reload} /> : null}
      {!feedback.loading && !feedback.error && items.length === 0 ? (
        <div>
          <p className="font-medium text-ink">No feedback yet</p>
          <p className="text-ink-2">Thumbs up and down from the study tutor appear here</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className="divide-y divide-stone">
          {items.map((item) => (
            <li key={item.message_id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={item.rating === "up" ? "success" : "danger"}>
                  {item.rating === "up" ? "Thumbs up" : "Thumbs down"}
                </Chip>
                {item.reason ? <Chip>{REASON_LABEL[item.reason]}</Chip> : null}
                {item.abstained ? <Chip>Declined to answer</Chip> : null}
                <span className="text-small text-ink-2">{formatDateTime(item.created_at)}</span>
              </div>
              <p className="font-medium text-ink">{item.question}</p>
              {item.answer ? <p className="line-clamp-3 max-w-prose text-ink-2">{item.answer}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </FlatSection>
  );
}
