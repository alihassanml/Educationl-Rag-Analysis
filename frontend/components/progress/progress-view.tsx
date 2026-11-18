"use client";

import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TopicStatusLabel } from "@/components/ui/status-label";
import { progressApi } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { useApi } from "@/lib/use-api";
import type { TopicProgress } from "@/types/api";
import { MIN_POINTS_FOR_CHART, ScoreChart } from "./score-chart";
import { TopicRow } from "./topic-row";

type Order = "none" | "asc" | "desc";

/** Topics with no accuracy yet sort last in either direction. */
export function sortByAccuracy(items: TopicProgress[], order: Order): TopicProgress[] {
  if (order === "none") return items;
  const sign = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.accuracy_percent === null && b.accuracy_percent === null) return 0;
    if (a.accuracy_percent === null) return 1;
    if (b.accuracy_percent === null) return -1;
    return sign * (a.accuracy_percent - b.accuracy_percent);
  });
}

export function ProgressView() {
  const topics = useApi(progressApi.topics);
  const summary = useApi(progressApi.summary);
  const [order, setOrder] = useState<Order>("none");
  const loading = topics.loading || summary.loading;
  const error = topics.error ?? summary.error;
  const history = summary.data?.score_history ?? [];
  const items = sortByAccuracy(topics.data?.items ?? [], order);
  const rules = topics.data?.rules;

  function cycleOrder() {
    setOrder((o) => (o === "none" ? "asc" : o === "asc" ? "desc" : "none"));
  }

  return (
    <PageContainer>
      <PageHeader title="Progress" description="How you're doing on each topic, and why we suggest what we do" />
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
          <EmptyState title="No quiz results yet" icon={BarChart3} action={<ButtonLink href="/quizzes">Start a quiz</ButtonLink>}>
            Complete a quiz and your topic progress will appear here
          </EmptyState>
        ) : null}

        {topics.data && topics.data.items.length > 0 && rules ? (
          <>
            <div className="hidden overflow-hidden rounded-panel border border-stone bg-paper sm:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Progress by topic</caption>
                <thead className="bg-stone text-left text-ink">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Topic</th>
                    <th scope="col" className="px-4 py-3 font-medium" aria-sort={order === "none" ? "none" : order === "asc" ? "ascending" : "descending"}>
                      <button type="button" onClick={cycleOrder} className="inline-flex items-center gap-1 font-medium" aria-label="Sort by accuracy">
                        Accuracy
                        {order === "asc" ? <ArrowUp size={14} strokeWidth={1.75} aria-hidden="true" /> : null}
                        {order === "desc" ? <ArrowDown size={14} strokeWidth={1.75} aria-hidden="true" /> : null}
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">Attempts</th>
                    <th scope="col" className="px-4 py-3 font-medium">Last practised</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((topic) => (
                    <tr key={topic.topic_id} className="h-12 border-t border-stone align-middle">
                      <td className="px-4 py-2 font-medium text-ink">{topic.topic_name}</td>
                      <td className="w-64 px-4 py-2">
                        <ProgressBar value={topic.accuracy_percent ?? 0} label={`${topic.topic_name} accuracy`} />
                        <span className="sr-only">
                          {topic.accuracy_percent ?? 0}% · {topic.correct_answers} of {topic.questions_attempted} correct
                        </span>
                      </td>
                      <td className="px-4 py-2 text-ink-2">
                        {topic.correct_answers} of {topic.questions_attempted} correct
                      </td>
                      <td className="px-4 py-2 text-ink-2">{formatDate(topic.last_practiced_at)}</td>
                      <td className="px-4 py-2">
                        <TopicStatusLabel status={topic.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-3 sm:hidden">
              {items.map((topic) => (
                <li key={topic.topic_id} className="rounded-panel border border-stone bg-paper p-4">
                  <TopicRow topic={topic} />
                </li>
              ))}
            </ul>

            {history.length >= MIN_POINTS_FOR_CHART ? (
              <Panel title="Score history">
                <ScoreChart history={history} />
              </Panel>
            ) : null}

            <Panel title="How we decide" muted>
              <ul className="space-y-1 text-sm text-ink">
                <li>
                  <strong>Not enough data:</strong> fewer than {rules.min_attempts} questions answered on the topic
                </li>
                <li>
                  <strong>Needs revision:</strong> below {rules.needs_revision_below_percent}% correct
                </li>
                <li>
                  <strong>Practising:</strong> {rules.needs_revision_below_percent}% to {rules.doing_well_from_percent - 1}% correct
                </li>
                <li>
                  <strong>Doing well:</strong> {rules.doing_well_from_percent}% or more correct
                </li>
              </ul>
              <p className="mt-3 text-small text-ink-2">Scores reflect quiz results on your material, not your ability. They are simple starting rules for study guidance, not a prediction of exam results</p>
            </Panel>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
