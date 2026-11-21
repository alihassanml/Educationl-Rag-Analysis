"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/feedback";
import { FlatSection } from "@/components/ui/flat-section";
import { evalApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ComparePanel } from "./compare-panel";
import { LiveFeedback } from "./live-feedback";
import { RunList } from "./run-list";
import { StartRunPanel } from "./start-run-panel";
import { StatGrid } from "./stat-grid";

const POLL_MS = 2000;
// Below this many labelled items the results are shown with a warning (docs/UI_REDESIGN.md section 15)
const SMALL_SAMPLE = 150;

export function EvaluationView() {
  const datasets = useApi(evalApi.datasets);
  const runs = useApi(evalApi.runs);

  const items = runs.data?.items ?? [];
  const inProgress = items.some((run) => run.status === "queued" || run.status === "running");
  const reloadRuns = runs.reload;
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(reloadRuns, POLL_MS);
    return () => clearInterval(timer);
  }, [inProgress, reloadRuns]);

  const forbidden = datasets.error?.status === 403 || runs.error?.status === 403;
  const error = datasets.error ?? runs.error;
  const loading = datasets.loading || runs.loading;
  const completed = items.filter((run) => run.status === "completed" && run.metrics);

  return (
    <PageContainer>
      <PageHeader
        title="Evaluation Lab"
        description="How accurately EduRAG retrieves, cites and abstains, measured on a labelled question set"
      />
      <div className="flex flex-col gap-6">
        {forbidden ? <Notice>This area is for administrators</Notice> : null}
        {loading && !forbidden ? <LoadingBlock label="Loading evaluation runs" /> : null}
        {error && !forbidden ? (
          <ErrorBlock
            message={error.message}
            onRetry={() => {
              datasets.reload();
              runs.reload();
            }}
          />
        ) : null}

        {!forbidden && !loading && !error ? (
          <>
            {completed.length > 0 && completed[0].items_total < SMALL_SAMPLE ? (
              <Notice tone="warning">Small test set ({completed[0].items_total} items). Results may not reflect real course material</Notice>
            ) : null}
            {completed.length > 0 ? <StatGrid latest={completed[0]} previous={completed[1] ?? null} /> : null}
            {items.length === 0 ? (
              <EmptyState title="No evaluation runs yet">
                Start a run below. It scores whether the expected page appears among the retrieved passages
              </EmptyState>
            ) : (
              <FlatSection title="Runs">
                <RunList runs={items} />
              </FlatSection>
            )}
            <StartRunPanel datasets={datasets.data?.items ?? []} onStarted={() => runs.reload()} />
            <ComparePanel runs={completed} />
            <LiveFeedback />
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
