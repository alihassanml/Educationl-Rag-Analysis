"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { progressApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { MIN_POINTS_FOR_CHART, ScoreChart } from "./score-chart";
import { TopicRow } from "./topic-row";

export function ProgressView() {
  const topics = useApi(progressApi.topics);
  const summary = useApi(progressApi.summary);
  const loading = topics.loading || summary.loading;
  const error = topics.error ?? summary.error;
  const history = summary.data?.score_history ?? [];

  return (
    <PageContainer>
      <PageHeader title="Progress" description="How you are doing on each topic, based on the quizzes you completed." />
      <div className="flex flex-col gap-6">
        {loading ? <LoadingBlock label="Loading your progress" /> : null}
        {error ? (
          <ErrorBlock
            message={error.message}
            onRetry={() => {
              topics.reload();
              summary.reload();
            }}
          />
        ) : null}

        {topics.data && topics.data.items.length === 0 ? (
          <EmptyState
            title="No quiz results yet"
            action={
              <Link href="/quizzes" className="font-medium text-clay-strong underline-offset-4 hover:underline">
                Create a quiz
              </Link>
            }
          >
            Complete a quiz and your topic progress will appear here.
          </EmptyState>
        ) : null}

        {topics.data && topics.data.items.length > 0 ? (
          <>
            <Panel title="Topics">
              <ul className="divide-y divide-stone">
                {topics.data.items.map((topic) => (
                  <li key={topic.topic_id} className="py-4 first:pt-0 last:pb-0">
                    <TopicRow topic={topic} />
                  </li>
                ))}
              </ul>
            </Panel>

            {history.length >= MIN_POINTS_FOR_CHART ? (
              <Panel title="Score history">
                <ScoreChart history={history} />
              </Panel>
            ) : null}

            <Panel title="How these labels work">
              <ul className="space-y-1 text-sm">
                <li>
                  <strong>Not enough data:</strong> fewer than {topics.data.rules.min_attempts} questions answered on the topic.
                </li>
                <li>
                  <strong>Needs revision:</strong> below {topics.data.rules.needs_revision_below_percent}% correct.
                </li>
                <li>
                  <strong>Practicing:</strong> {topics.data.rules.needs_revision_below_percent}% to {topics.data.rules.doing_well_from_percent - 1}% correct.
                </li>
                <li>
                  <strong>Doing well:</strong> {topics.data.rules.doing_well_from_percent}% or more correct.
                </li>
              </ul>
              <p className="mt-3 text-sm text-ink-2">
                These are simple starting rules for study guidance. They are not a measure of ability or a prediction of exam results.
              </p>
            </Panel>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
