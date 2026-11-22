import Link from "next/link";
import { RunStatusLabel } from "@/components/ui/status-label";
import { formatDateTime } from "@/lib/formatters";
import { modeLabel } from "@/lib/eval-format";
import type { EvalRun } from "@/types/api";

export function RunList({ runs }: { runs: EvalRun[] }) {
  return (
    <ul className="divide-y divide-stone">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Link
              href={`/evaluation/runs/${run.id}`}
              className="font-medium text-accent-link underline-offset-4 hover:underline"
            >
              {run.dataset_name}, {modeLabel(run.config.retrieval_mode).toLowerCase()} retrieval
            </Link>
            <p className="text-sm text-ink-2">
              {formatDateTime(run.created_at)}
              {run.status === "running" || run.status === "queued"
                ? ` · ${run.items_done} of ${run.items_total} questions`
                : null}
            </p>
          </div>
          <RunStatusLabel status={run.status} />
        </li>
      ))}
    </ul>
  );
}
