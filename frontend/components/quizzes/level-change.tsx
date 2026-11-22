import { Chip } from "@/components/ui/chip";
import type { AttemptResult, Difficulty } from "@/types/api";

export const LEVEL_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/** The level a quiz was taken at. */
export function LevelChip({ level }: { level: Difficulty }) {
  return <Chip tone="neutral">{LEVEL_LABEL[level]}</Chip>;
}

/** "Level up: Intermediate → Advanced", with the plain reason under it. Says nothing for a quiz that
 *  has no topic, because a level belongs to a topic. */
export function LevelChangeNote({ result }: { result: AttemptResult }) {
  const { previous_difficulty: from, next_difficulty: to, level_change: change, difficulty_reason: reason } = result;
  if (!from || !to || !change) return null;
  const moved = change !== "same";
  return (
    <div className="mt-3 flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
        {moved ? (
          <Chip tone={change === "up" ? "success" : "warning"}>
            {change === "up" ? "Level up" : "Level down"}
          </Chip>
        ) : (
          <Chip>Same level</Chip>
        )}
        <span>
          {LEVEL_LABEL[from]}
          {moved ? ` → ${LEVEL_LABEL[to]}` : ""}
        </span>
      </p>
      {reason ? <p className="text-sm text-ink-2">{reason}</p> : null}
    </div>
  );
}

/** Wording of the "next quiz" button for what the result did to the level. */
export function nextQuizLabel(change: AttemptResult["level_change"]): string {
  if (change === "up") return "Try a harder quiz";
  if (change === "down") return "Try an easier quiz";
  return "Try another quiz";
}
