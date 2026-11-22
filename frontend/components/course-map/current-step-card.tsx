import Link from "next/link";
import { cardLinkClass, DashCard } from "@/components/dashboard/dash-card";
import { LevelChip } from "@/components/quizzes/level-change";
import { ButtonLink } from "@/components/ui/button";
import { TopicStatusLabel } from "@/components/ui/status-label";
import type { LearningPath } from "@/types/api";

/** Dashboard card: the step the Course Map says to take now. */
export function CurrentStepCard({ path }: { path: LearningPath }) {
  if (path.steps.length === 0) return null;
  const current = path.steps.find((s) => s.is_current);
  return (
    <DashCard
      title="Course map"
      action={
        <Link href="/course-map" className={cardLinkClass}>
          Open
        </Link>
      }
    >
      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-ink">{current.name}</p>
            <TopicStatusLabel status={current.status} />
            {current.level ? <LevelChip level={current.level} /> : null}
          </div>
          <ButtonLink size="sm" href={`/tutor?mode=quiz&q=${encodeURIComponent(current.name)}`}>
            Quiz
          </ButtonLink>
        </div>
      ) : (
        <p className="text-ink">Every topic is going well.</p>
      )}
    </DashCard>
  );
}
