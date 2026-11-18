import { cn } from "@/lib/cn";
import { formatDelta, formatLatency, formatPercent, type Delta } from "@/lib/eval-format";
import type { EvalMetrics, EvalRun } from "@/types/api";

type Cell = { caption: string; value: string; delta: Delta | null; previously?: string };

function cells(latest: EvalMetrics, previous: EvalMetrics | null): Cell[] {
  return [
    {
      caption: "Hit rate at 5",
      value: formatPercent(latest.hit_rate["5"]),
      delta: previous ? formatDelta(previous.hit_rate["5"], latest.hit_rate["5"]) : null,
    },
    {
      caption: "MRR",
      value: latest.mrr.toFixed(3),
      delta: previous ? formatDelta(previous.mrr, latest.mrr, "abs") : null,
    },
    {
      caption: "Abstention F1",
      value: formatPercent(latest.abstention.f1),
      delta: previous ? formatDelta(previous.abstention.f1, latest.abstention.f1) : null,
    },
    {
      caption: "p95 latency",
      value: formatLatency(latest.latency_ms.p95),
      delta: null,
      previously: previous ? `Previously ${formatLatency(previous.latency_ms.p95)}` : undefined,
    },
  ];
}

const deltaTone = { up: "text-success", down: "text-danger", flat: "text-ink-2" } as const;

/** Headline numbers of the latest completed run, each compared with the run before it. */
export function StatGrid({ latest, previous }: { latest: EvalRun; previous: EvalRun | null }) {
  if (!latest.metrics) return null;
  const items = cells(latest.metrics, previous?.metrics ?? null);
  const unscored = latest.metrics.n_errors;
  return (
    <div className="flex flex-col gap-2">
    <dl className="stat-grid grid grid-cols-2 overflow-hidden rounded-panel border border-stone bg-paper shadow-sm">
      {items.map((cell, index) => (
        <div
          key={cell.caption}
          className={cn(
            "flex flex-col gap-1 p-5 sm:p-6",
            index % 2 === 1 && "border-l border-stone",
            index >= 2 && "border-t border-stone",
          )}
        >
          <dd className="order-2 text-3xl font-medium tabular-nums sm:text-4xl">{cell.value}</dd>
          <dt className="order-1 text-sm text-ink-2">{cell.caption}</dt>
          <p className={cn("order-3 text-sm tabular-nums", cell.delta ? deltaTone[cell.delta.direction] : "text-ink-2")}>
            {cell.delta ? cell.delta.text : (cell.previously ?? "No previous run")}
          </p>
        </div>
      ))}
    </dl>
    {unscored > 0 ? (
      <p className="text-sm text-warning">
        {unscored} {unscored === 1 ? "question" : "questions"} could not be scored and {unscored === 1 ? "is" : "are"} left out of these numbers
      </p>
    ) : null}
    </div>
  );
}
