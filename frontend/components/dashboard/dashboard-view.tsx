"use client";

import { Check, Circle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScoreChart, MIN_POINTS_FOR_CHART } from "@/components/progress/score-chart";
import { TopicRow } from "@/components/progress/topic-row";
import { ButtonLink } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";
import { progressApi } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { useGreeting } from "@/lib/greeting";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/cn";
import type { ProgressSummary } from "@/types/api";

const MAX_REVISION_ROWS = 5;

type Step = { title: string; done: boolean; href: string; action: string };

/** First-run checklist. Done states come from real API data only: the backend does not store tutor
 *  questions, so "Ask your first question" is never reported as done. */
function Checklist({ data }: { data: ProgressSummary }) {
  const steps: Step[] = [
    { title: "Upload a PDF", done: data.documents_total > 0, href: "/library", action: "Upload PDF" },
    { title: "Ask your first question", done: false, href: "/tutor", action: "Ask a question" },
    { title: "Take a quiz", done: data.quizzes_completed > 0, href: "/quizzes", action: "Start a quiz" },
  ];
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);

  return (
    <Panel title="Get started in three steps" className="max-w-2xl">
      <p className="mb-4 text-ink-2">
        {done} of {steps.length} done
      </p>
      <ol className="divide-y divide-stone">
        {steps.map((step, i) => (
          <li key={step.title} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <span className="flex items-center gap-3">
              {step.done ? (
                <Check size={20} strokeWidth={1.75} className="text-success" aria-hidden="true" />
              ) : (
                <Circle size={20} strokeWidth={1.75} className="text-stone-strong" aria-hidden="true" />
              )}
              <span className={cn("font-medium", step.done ? "text-ink-2 line-through" : "text-ink")}>{step.title}</span>
              {step.done ? <span className="sr-only">Done</span> : null}
            </span>
            {!step.done ? (
              <ButtonLink href={step.href} variant={i === current ? "primary" : "secondary"}>
                {step.action}
              </ButtonLink>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function NextStep({ data }: { data: ProgressSummary }) {
  const next = data.next_step;
  const body = (() => {
    if (next) {
      return {
        title: next.topic_name,
        reason: next.recommendation.message,
        primary: <ButtonLink href={`/quizzes?topic=${encodeURIComponent(next.topic_name)}`}>Practise this topic</ButtonLink>,
        secondary: (
          <ButtonLink variant="secondary" href={`/tutor?q=${encodeURIComponent(`Explain ${next.topic_name} in simple words`)}`}>
            Ask the tutor about this
          </ButtonLink>
        ),
      };
    }
    if (data.latest_document) {
      return {
        title: data.latest_document.title,
        reason: "Your latest document is ready. Take a first quiz on it to find out which topics need work",
        primary: <ButtonLink href="/quizzes">Create your first quiz</ButtonLink>,
        secondary: (
          <ButtonLink variant="secondary" href="/tutor">
            Ask the tutor
          </ButtonLink>
        ),
      };
    }
    return {
      title: "Add your first document",
      reason: "Upload a document to continue studying",
      primary: <ButtonLink href="/library">Upload PDF</ButtonLink>,
      secondary: null,
    };
  })();

  return (
    <section className="h-full rounded-panel border border-stone border-l-[3px] border-l-clay bg-paper p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Recommended next step</p>
      <h2 className="mt-2 text-lg font-semibold text-ink">{body.title}</h2>
      <p className="mt-1 max-w-prose text-ink-2">{body.reason}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {body.primary}
        {body.secondary}
      </div>
    </section>
  );
}

/** A titled section with a hairline above it. Lists on the dashboard are not wrapped in cards. */
function FlatSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-stone pt-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Dashboard({ data }: { data: ProgressSummary }) {
  const isNew = data.documents_total === 0 && data.quizzes_completed === 0;
  if (isNew) return <Checklist data={data} />;

  const revision = data.needs_revision.slice(0, MAX_REVISION_ROWS);
  const average = data.average_score_percent;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-8">
          <NextStep data={data} />
        </div>
        <section aria-label="Snapshot" className="divide-y divide-stone-strong/30 rounded-panel bg-stone-100 px-5 lg:col-span-4">
          <StatTile
            bare
            className="py-4"
            label="Average quiz score"
            value={average === null ? null : `${average}%`}
            context={`from ${data.quizzes_completed} ${data.quizzes_completed === 1 ? "quiz" : "quizzes"}`}
          />
          <StatTile
            bare
            className="py-4"
            label="Topics needing revision"
            value={data.quizzes_completed === 0 ? null : data.topics_needing_revision}
            context={`${data.documents_ready} ${data.documents_ready === 1 ? "document" : "documents"} ready`}
          />
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <FlatSection title="Needs revision" action={revision.length > 0 ? <Link href="/progress" className="text-sm font-medium text-clay-strong underline-offset-4 hover:underline">View all progress</Link> : undefined}>
          {revision.length === 0 ? (
            <p className="text-ink-2">No topics need revision right now</p>
          ) : (
            <ul className="divide-y divide-stone">
              {revision.map((topic) => (
                <li key={topic.topic_id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <TopicRow topic={topic} compact />
                  <div>
                    <ButtonLink size="sm" variant="secondary" href={`/quizzes?topic=${encodeURIComponent(topic.topic_name)}`}>
                      Practise
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FlatSection>

        <FlatSection title="Recent activity">
          {data.recent_activity.length === 0 ? (
            <p className="text-ink-2">No completed quizzes yet</p>
          ) : (
            <ul className="divide-y divide-stone">
              {data.recent_activity.map((a) => (
                <li key={`${a.quiz_id}-${a.completed_at}`} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span>
                    <span className="font-medium text-ink">{a.topic ?? a.quiz_title}</span>
                    <span className="ml-2 text-small text-ink-2">{formatDate(a.completed_at)}</span>
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {a.score} of {a.total_questions} correct ({a.percent}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </FlatSection>
      </div>

      {data.score_history.length >= MIN_POINTS_FOR_CHART ? (
        <Panel title="Score history">
          <ScoreChart history={data.score_history} />
        </Panel>
      ) : null}
    </div>
  );
}

export function DashboardView() {
  const greeting = useGreeting();
  const { data, error, loading, reload } = useApi(progressApi.summary);
  return (
    <PageContainer>
      {/* No primary button in the header: the next-step card holds the one primary action */}
      <PageHeader title={greeting} description="Here’s what to focus on next" />
      {loading ? <LoadingBlock label="Loading your dashboard" /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
      {data ? <Dashboard data={data} /> : null}
    </PageContainer>
  );
}
