import Link from "next/link";
import { cardLinkClass, DashCard } from "@/components/dashboard/dash-card";
import { LevelChip } from "@/components/quizzes/level-change";
import { ButtonLink } from "@/components/ui/button";
import { TopicStatusLabel } from "@/components/ui/status-label";
import type { LearningPath } from "@/types/api";

/** Dashboard card: the step the Course Map says to take now, and the latest change to the route. */
export function CurrentStepCard({ path }: { path: LearningPath }) {
  if (path.steps.length === 0) return null;
  const current = path.steps.find((s) => s.is_current);
  return (
    <DashCard
      title="Your Course Map"
      action={
        <Link href="/course-map" className={cardLinkClass}>
          Open Course Map
        </Link>
      }
    >
      {current ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-small text-ink-2">Current step</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-ink">{current.name}</p>
              <TopicStatusLabel status={current.status} />
              {current.level ? <LevelChip level={current.level} /> : null}
            </div>
            <p className="mt-1 text-sm text-ink-2">{current.next_action.message}</p>
          </div>
          <ButtonLink size="sm" href={`/tutor?mode=quiz&q=${encodeURIComponent(current.name)}`}>
            Quiz on this topic
          </ButtonLink>
        </div>
      ) : (
        <p className="text-sm text-ink">You are doing well on every topic. Review them from the Course Map whenever you like.</p>
      )}
      {path.latest_event ? (
        <p className="mt-3 border-t border-stone pt-3 text-sm text-ink">
          <span className="font-medium">Route updated: </span>
          {path.latest_event.reason}
        </p>
      ) : null}
    </DashCard>
  );
}
