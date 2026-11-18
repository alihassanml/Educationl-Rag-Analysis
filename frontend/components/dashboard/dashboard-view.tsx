"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScoreChart, MIN_POINTS_FOR_CHART } from "@/components/progress/score-chart";
import { TopicRow } from "@/components/progress/topic-row";
import { ButtonLink } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { progressApi } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { useApi } from "@/lib/use-api";
import type { ProgressSummary } from "@/types/api";

const FIRST_STEPS = [
  "Upload a PDF of your notes, textbook, or past papers",
  "Wait while the document is processed",
  "Ask a question or create a quiz",
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-panel border border-stone bg-paper p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Dashboard({ data }: { data: ProgressSummary }) {
  const isNew = data.documents_total === 0 && data.quizzes_completed === 0;

  if (isNew) {
    return (
      <Panel title="Get started">
        <p className="text-ink-2">Your progress will appear here once you have studied.</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5">
          {FIRST_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Documents ready" value={data.documents_ready} />
        <Stat label="Quizzes completed" value={data.quizzes_completed} />
        <Stat label="Average quiz score" value={data.average_score_percent === null ? "None yet" : `${data.average_score_percent}%`} />
        <Stat label="Topics needing revision" value={data.topics_needing_revision} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Continue studying">
          {data.next_step ? (
            <div className="flex flex-col gap-4">
              <p>{data.next_step.recommendation.message}</p>
              <div>
                <ButtonLink variant="secondary" href="/quizzes">
                  Create a quiz
                </ButtonLink>
              </div>
            </div>
          ) : data.latest_document ? (
            <p>
              Your latest document is <strong>{data.latest_document.title}</strong>. Ask the tutor about it or{" "}
              <Link href="/quizzes" className="font-medium text-clay-strong underline-offset-4 hover:underline">
                create your first quiz
              </Link>
              .
            </p>
          ) : (
            <p className="text-ink-2">Upload a document to continue studying.</p>
          )}
        </Panel>

        <Panel title="Needs revision">
          {data.needs_revision.length === 0 ? (
            <p className="text-ink-2">No topics need revision right now.</p>
          ) : (
            <ul className="divide-y divide-stone">
              {data.needs_revision.map((topic) => (
                <li key={topic.topic_id} className="py-3 first:pt-0 last:pb-0">
                  <TopicRow topic={topic} compact />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Recent activity"
        action={
          <Link href="/progress" className="text-sm font-medium text-clay-strong underline-offset-4 hover:underline">
            View all progress
          </Link>
        }
      >
        {data.recent_activity.length === 0 ? (
          <p className="text-ink-2">No completed quizzes yet.</p>
        ) : (
          <ul className="divide-y divide-stone">
            {data.recent_activity.map((a) => (
              <li key={`${a.quiz_id}-${a.completed_at}`} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <span>
                  {a.topic ?? a.quiz_title}
                  <span className="ml-2 text-sm text-ink-2">{formatDate(a.completed_at)}</span>
                </span>
                <span className="text-sm font-medium">
                  {a.score} of {a.total_questions} correct ({a.percent}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {data.score_history.length >= MIN_POINTS_FOR_CHART ? (
        <Panel title="Score history">
          <ScoreChart history={data.score_history} />
        </Panel>
      ) : null}
    </div>
  );
}

export function DashboardView() {
  const { data, error, loading, reload } = useApi(progressApi.summary);
  return (
    <PageContainer>
      <PageHeader
        title="Your learning"
        description="Continue from your recent study activity."
        action={
          <>
            <ButtonLink variant="secondary" href="/library">
              Upload material
            </ButtonLink>
            <ButtonLink href="/tutor">Ask your tutor</ButtonLink>
          </>
        }
      />
      {loading ? <LoadingBlock label="Loading your dashboard" /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
      {data ? <Dashboard data={data} /> : null}
    </PageContainer>
  );
}
