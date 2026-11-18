import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/formatters";
import { formatDelta, formatPercent, type Delta } from "@/lib/eval-format";
import type { EvalRun } from "@/types/api";

const deltaTone = { up: "text-success", down: "text-danger", flat: "text-ink-2" } as const;

function Context({ delta, fallback }: { delta: Delta | null; fallback: string }) {
  return <span className={cn(delta ? deltaTone[delta.direction] : "text-ink-2")}>{delta ? delta.text : fallback}</span>;
}

/** Headline numbers of the latest completed run (Hit@5, MRR, abstention accuracy, items tested), each with
 *  its change against the run before it. The sample size and date are always shown next to the numbers. */
export function StatGrid({ latest, previous }: { latest: EvalRun; previous: EvalRun | null }) {
  const m = latest.metrics;
  if (!m) return null;
  const p = previous?.metrics ?? null;
  const tested = m.n_answerable + m.n_unanswerable;
  const unscored = m.n_errors;
  const date = formatDate(latest.finished_at ?? latest.created_at);

  return (
    <div className="flex flex-col gap-3">
      <div className="stat-grid grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Hit rate at 5" value={formatPercent(m.hit_rate["5"])} context={<Context delta={p ? formatDelta(p.hit_rate["5"], m.hit_rate["5"]) : null} fallback="No previous run" />} />
        <StatTile label="MRR" value={m.mrr.toFixed(3)} context={<Context delta={p ? formatDelta(p.mrr, m.mrr, "abs") : null} fallback="No previous run" />} />
        <StatTile label="Abstention accuracy" value={formatPercent(m.abstention.accuracy)} context={<Context delta={p ? formatDelta(p.abstention.accuracy, m.abstention.accuracy) : null} fallback="No previous run" />} />
        <StatTile label="Items tested" value={tested} context={`${m.n_answerable} answerable, ${m.n_unanswerable} not`} />
      </div>
      <p className="text-small text-ink-2">
        {tested} labelled questions · {latest.dataset_name} · {date}
      </p>
      {unscored > 0 ? (
        <p className="text-sm text-warning">
          {unscored} {unscored === 1 ? "question" : "questions"} could not be scored and {unscored === 1 ? "is" : "are"} left out of these numbers
        </p>
      ) : null}
    </div>
  );
}
