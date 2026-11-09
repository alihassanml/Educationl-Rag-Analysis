"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { RunStatusLabel } from "@/components/ui/status-label";
import { evalApi } from "@/lib/api";
import { formatLatency, formatPercent, modeLabel } from "@/lib/eval-format";
import { useApi } from "@/lib/use-api";
import type { EvalMetrics, EvalOutcome, EvalRun } from "@/types/api";
import { ConfusionMatrix } from "./confusion-matrix";
import { HitRateChart } from "./hit-rate-chart";
import { ResultList } from "./result-list";

const POLL_MS = 2000;
const RESULT_LIMIT = 100;

function ResultsLoader({
  runId,
  filter,
  onFilterChange,
}: {
  runId: string;
  filter: EvalOutcome;
  onFilterChange: (filter: EvalOutcome) => void;
}) {
  const results = useApi((signal) => evalApi.results(runId, { outcome: filter, limit: RESULT_LIMIT, offset: 0 }, signal));
  if (results.error) return <ErrorBlock message={results.error.message} onRetry={results.reload} />;
  if (!results.data) return <LoadingBlock label="Loading questions" />;
  return (
    <ResultList
      results={results.data.items}
      total={results.data.total}
      filter={filter}
      onFilterChange={onFilterChange}
    />
  );
}

function ResultsPanel({ runId }: { runId: string }) {
  const [filter, setFilter] = useState<EvalOutcome>("all");
  // Remounting per filter refetches without extra state plumbing.
  return (
    <Panel title="Questions">
      <ResultsLoader key={filter} runId={runId} filter={filter} onFilterChange={setFilter} />
    </Panel>
  );
}

function Summary({ metrics }: { metrics: EvalMetrics }) {
  const { abstention: a, ci } = metrics;
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Retrieval quality">
        <HitRateChart hitRate={metrics.hit_rate} />
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">MRR</dt>
            <dd className="text-lg font-medium tabular-nums">{metrics.mrr.toFixed(3)}</dd>
          </div>
          <div>
            <dt className="text-muted">nDCG at 5</dt>
            <dd className="text-lg font-medium tabular-nums">{metrics.ndcg["5"].toFixed(3)}</dd>
          </div>
          <div>
            <dt className="text-muted">Latency p50</dt>
            <dd className="text-lg font-medium tabular-nums">{formatLatency(metrics.latency_ms.p50)}</dd>
          </div>
          <div>
            <dt className="text-muted">Latency p95</dt>
            <dd className="text-lg font-medium tabular-nums">{formatLatency(metrics.latency_ms.p95)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">
          95% intervals: hit rate at 5 {formatPercent(ci["hit_rate@5"][0])} to {formatPercent(ci["hit_rate@5"][1])}, MRR{" "}
          {ci.mrr[0].toFixed(3)} to {ci.mrr[1].toFixed(3)}. Based on {metrics.n_answerable} answerable and{" "}
          {metrics.n_unanswerable} unanswerable questions
          {metrics.n_errors > 0 ? `; ${metrics.n_errors} could not be scored` : ""}. Hit rate, MRR and nDCG rank every
          retrieved passage before the similarity threshold is applied; a question only passes when the expected passage
          also reaches the threshold.
        </p>
      </Panel>
      <Panel title="Abstention">
        <ConfusionMatrix abstention={a} />
        <p className="mt-4 text-sm text-muted">
          Precision {formatPercent(a.precision)}, recall {formatPercent(a.recall)}, F1 {formatPercent(a.f1)}. A passage
          must reach the similarity threshold for the system to answer.
        </p>
      </Panel>
    </div>
  );
}

function Header({ run }: { run: EvalRun }) {
  return (
    <>
      <Link href="/evaluation" className="mb-4 inline-block text-sm text-primary underline-offset-4 hover:underline">
        Evaluation Lab
      </Link>
      <PageHeader
        title={`${modeLabel(run.config.retrieval_mode)} retrieval on ${run.dataset_name}`}
        description="Retrieval only, no answer generation yet. Each question is scored on whether the expected page appears among the retrieved passages."
        action={<RunStatusLabel status={run.status} />}
      />
    </>
  );
}

export function RunView({ runId }: { runId: string }) {
  const run = useApi((signal) => evalApi.run(runId, signal));
  const status = run.data?.status;
  const inProgress = status === "queued" || status === "running";
  const reload = run.reload;
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [inProgress, reload]);

  if (run.error && !run.data) {
    return (
      <PageContainer>
        {run.error.status === 403 ? (
          <Notice>This area is for administrators</Notice>
        ) : (
          <ErrorBlock message={run.error.message} onRetry={run.reload} />
        )}
      </PageContainer>
    );
  }
  if (!run.data) {
    return (
      <PageContainer>
        <LoadingBlock label="Loading the run" />
      </PageContainer>
    );
  }

  const data = run.data;
  return (
    <PageContainer>
      <Header run={data} />
      <div className="flex flex-col gap-6">
        {inProgress ? (
          <Panel title="In progress">
            <progress
              className="h-2 w-full"
              max={Math.max(data.items_total, 1)}
              value={data.items_done}
              aria-label="Evaluation progress"
            />
            <p className="mt-2 text-sm text-muted">
              {data.items_done} of {data.items_total} questions
            </p>
            {status === "queued" ? (
              <p className="mt-1 text-sm text-muted">Waiting for the background worker to pick this run up</p>
            ) : null}
          </Panel>
        ) : null}
        {status === "failed" ? <ErrorBlock message={data.error_message ?? "The evaluation could not be completed"} /> : null}
        {status === "completed" && data.metrics ? (
          <>
            <Summary metrics={data.metrics} />
            <ResultsPanel runId={runId} />
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
