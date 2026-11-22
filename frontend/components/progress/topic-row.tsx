import { ProgressBar } from "@/components/ui/progress-bar";
import { TopicStatusLabel } from "@/components/ui/status-label";
import { formatDate } from "@/lib/formatters";
import type { TopicProgress } from "@/types/api";

/** Compact list row: topic, status, accuracy as a bar with its text, and optionally the reason.
 *  `hideStatus` drops the chip where the surrounding section already says it (the dashboard's "Needs revision" list). */
export function TopicRow({ topic, compact = false, hideStatus = false }: { topic: TopicProgress; compact?: boolean; hideStatus?: boolean }) {
  const percent = topic.accuracy_percent;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-ink">{topic.topic_name}</p>
        {hideStatus ? null : <TopicStatusLabel status={topic.status} />}
      </div>
      <ProgressBar value={percent ?? 0} label={`${topic.topic_name} accuracy`} />
      {/* The bar already shows the percentage, so it is not repeated here */}
      <p className="text-small text-ink-2">
        {topic.correct_answers} of {topic.questions_attempted} correct
      </p>
      {compact ? null : (
        <>
          <p className="text-sm text-ink-2">{topic.recommendation.message}</p>
          <p className="text-small text-ink-2">Last practised {formatDate(topic.last_practiced_at)}</p>
        </>
      )}
    </div>
  );
}
