import { TopicStatusLabel } from "@/components/ui/status-label";
import { formatDate } from "@/lib/formatters";
import type { TopicProgress } from "@/types/api";

export function TopicRow({ topic, compact = false }: { topic: TopicProgress; compact?: boolean }) {
  const percent = topic.accuracy_percent;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{topic.topic_name}</p>
        <TopicStatusLabel status={topic.status} />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div className="h-full bg-primary" style={{ width: `${percent ?? 0}%` }} />
        </div>
        <p className="w-44 shrink-0 text-right text-sm">
          {percent ?? 0}% · {topic.correct_answers} of {topic.questions_attempted} correct
        </p>
      </div>
      {compact ? null : (
        <>
          <p className="text-sm text-muted">{topic.recommendation.message}</p>
          <p className="text-xs text-muted">Last practiced {formatDate(topic.last_practiced_at)}</p>
        </>
      )}
    </div>
  );
}
