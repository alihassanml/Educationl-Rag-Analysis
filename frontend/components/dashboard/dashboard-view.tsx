"use client";

import { ArrowRight, Check, Circle, MessageSquare } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScoreChart, MIN_POINTS_FOR_CHART } from "@/components/progress/score-chart";
import { TopicRow } from "@/components/progress/topic-row";
import { ButtonLink } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { FlatSection } from "@/components/ui/flat-section";
import { StatTile } from "@/components/ui/stat-tile";
import { progressApi, tutorApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/formatters";
import { useGreeting } from "@/lib/greeting";
import { formatRelative } from "@/lib/relative-time";
import { useApi } from "@/lib/use-api";
import type { ProgressSummary, StudyInsights, ThreadSummary } from "@/types/api";
import { HotPages, LibraryCoverage, QuickActions } from "./library-insights";
import { ActivityHeatmap, StreakCard } from "./study-activity";

const MAX_REVISION_ROWS = 5;
const MAX_RECENT_CHATS = 4;

type Step = { title: string; hint: string; done: boolean; href: string; action: string };

/** First-run checklist. Every done state comes from real API data. */
function Checklist({ data, threads }: { data: ProgressSummary; threads: ThreadSummary[] }) {
  const steps: Step[] = [
    { title: "Upload a PDF", hint: "Notes, slides or a chapter. It stays private to your account", done: data.documents_total > 0, href: "/library", action: "Upload PDF" },
    { title: "Ask your first question", hint: "The answer cites the document and page it came from", done: threads.length > 0, href: "/tutor", action: "Ask a question" },
    { title: "Take a quiz", hint: "Quiz results show which topics to revise next", done: data.quizzes_completed > 0, href: "/tutor?mode=quiz", action: "Start a quiz" },
  ];
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="rounded-panel border border-stone bg-paper p-6 lg:col-span-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">Get started in three steps</h2>
          <p className="text-ink-2">
            {done} of {steps.length} done
          </p>
        </div>
        <ol className="mt-4 divide-y divide-stone">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <span className="flex items-start gap-3">
                {step.done ? (
                  <Check size={20} strokeWidth={1.75} className="mt-0.5 text-success" aria-hidden="true" />
                ) : (
                  <Circle size={20} strokeWidth={1.75} className="mt-0.5 text-stone-strong" aria-hidden="true" />
                )}
                <span>
                  <span className={cn("block font-medium", step.done ? "text-ink-2 line-through" : "text-ink")}>{step.title}</span>
                  <span className="block text-small text-ink-2">{step.hint}</span>
                  {step.done ? <span className="sr-only">Done</span> : null}
                </span>
              </span>
              {!step.done ? (
                <ButtonLink href={step.href} variant={i === current ? "primary" : "secondary"}>
                  {step.action}
                </ButtonLink>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="What you get" className="rounded-panel bg-stone-100 p-6 lg:col-span-4">
        <h2 className="text-lg font-semibold text-ink">What you get</h2>
        <ul className="mt-4 space-y-4 text-ink">
          <li>
            <p className="font-medium">Answers from your own files</p>
            <p className="text-small text-ink-2">Never from general web knowledge</p>
          </li>
          <li>
            <p className="font-medium">The page behind every answer</p>
            <p className="text-small text-ink-2">Or “Not found in your material” when it isn’t covered</p>
          </li>
          <li>
            <p className="font-medium">A clear next step</p>
            <p className="text-small text-ink-2">Quiz results decide what you revise</p>
          </li>
        </ul>
      </section>
    </div>
  );
}

function NextStep({ data }: { data: ProgressSummary }) {
  const next = data.next_step;
  const body = (() => {
    if (next) {
      return {
        title: next.topic_name,
        reason: next.recommendation.message,
        primary: <ButtonLink href={`/tutor?mode=quiz&q=${encodeURIComponent(next.topic_name)}`}>Practise this topic</ButtonLink>,
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
        primary: <ButtonLink href="/tutor?mode=quiz">Create your first quiz</ButtonLink>,
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
    <section className="flex h-full flex-col justify-between rounded-panel bg-clay-300 p-6 lg:p-8">
      <div>
        <p className="text-sm font-medium text-ink-2">Recommended next step</p>
        <h2 className="mt-2 line-clamp-2 text-h1 font-semibold tracking-tight text-ink lg:text-h1-lg">{body.title}</h2>
        <p className="mt-2 max-w-prose text-base text-ink">{body.reason}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {body.primary}
        {body.secondary}
      </div>
    </section>
  );
}

function StatStrip({ data, insights }: { data: ProgressSummary; insights: StudyInsights | null }) {
  const average = data.average_score_percent;
  const answered = insights ? insights.answers_with_sources + insights.answers_not_found : 0;
  const grounded = insights && answered > 0 ? Math.round((insights.answers_with_sources / answered) * 100) : null;
  const cells = [
    insights
      ? { label: "Questions asked", value: insights.questions_asked, context: `over ${insights.active_days} study ${insights.active_days === 1 ? "day" : "days"}` }
      : { label: "Documents ready", value: data.documents_ready, context: `of ${data.documents_total} uploaded` },
    {
      label: "Answers backed by sources",
      value: grounded === null ? null : `${grounded}%`,
      context: insights ? `${insights.citations_total} page citations · ${insights.answers_not_found} not in your material` : "",
    },
    insights
      ? { label: "Pages indexed", value: insights.pages_indexed, context: `${insights.chunks_indexed} passages in ${data.documents_ready} ${data.documents_ready === 1 ? "document" : "documents"}` }
      : { label: "Quizzes completed", value: data.quizzes_completed === 0 ? null : data.quizzes_completed, context: "finished attempts" },
    {
      label: "Average quiz score",
      value: average === null ? null : `${average}%`,
      context: `from ${data.quizzes_completed} ${data.quizzes_completed === 1 ? "quiz" : "quizzes"} · ${data.topics_needing_revision} to revise`,
    },
  ];
  return (
    <section aria-label="Snapshot" className="grid grid-cols-2 border-y border-stone lg:grid-cols-4 lg:divide-x lg:divide-stone">
      {cells.map((cell) => (
        <StatTile key={cell.label} bare className="p-5 lg:px-8 lg:py-6 lg:first:pl-0" label={cell.label} value={cell.value} context={cell.context} />
      ))}
    </section>
  );
}

function Dashboard({ data, threads, insights }: { data: ProgressSummary; threads: ThreadSummary[]; insights: StudyInsights | null }) {
  const isNew = data.documents_total === 0 && data.quizzes_completed === 0;
  if (isNew) return <Checklist data={data} threads={threads} />;

  const hasQuizzes = data.quizzes_completed > 0;
  const revision = data.needs_revision.slice(0, MAX_REVISION_ROWS);
  const showScoreChart = data.score_history.length >= MIN_POINTS_FOR_CHART;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className={insights ? "lg:col-span-8" : "lg:col-span-12"}>
          <NextStep data={data} />
        </div>
        {insights ? (
          <div className="lg:col-span-4">
            <StreakCard insights={insights} />
          </div>
        ) : null}
      </div>

      {/* Numbers appear once there is something to count; a row of dashes helps nobody */}
      {hasQuizzes || (insights && insights.questions_asked > 0) ? <StatStrip data={data} insights={insights} /> : null}

      {insights ? (
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <FlatSection title="Study activity" action={<span className="text-small text-ink-2">Last 12 weeks</span>}>
              <ActivityHeatmap insights={insights} />
            </FlatSection>
          </div>
          <div className="lg:col-span-5">
            <FlatSection title="Quick actions">
              <QuickActions latestDocId={data.latest_document?.id ?? null} />
            </FlatSection>
          </div>

          {insights.documents.length > 0 ? (
            <div className="lg:col-span-7">
              <FlatSection
                title="Your library"
                action={<Link href="/library" className="text-sm font-medium text-accent-link underline-offset-4 hover:underline">Manage library</Link>}
              >
                <LibraryCoverage documents={insights.documents} />
              </FlatSection>
            </div>
          ) : null}
          <div className={insights.documents.length > 0 ? "lg:col-span-5" : "lg:col-span-12"}>
            <FlatSection title="Pages you keep coming back to">
              <HotPages pages={insights.hot_pages} />
            </FlatSection>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
        {hasQuizzes ? (
          <FlatSection
            title="Needs revision"
            action={revision.length > 0 ? <Link href="/progress" className="text-sm font-medium text-accent-link underline-offset-4 hover:underline">View all progress</Link> : undefined}
          >
            {revision.length === 0 ? (
              <p className="text-ink-2">No topics need revision right now</p>
            ) : (
              <ul className="divide-y divide-stone">
                {revision.map((topic) => (
                  <li key={topic.topic_id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <TopicRow topic={topic} compact hideStatus />
                    </div>
                    <ButtonLink size="sm" variant="secondary" className="self-start sm:self-center" href={`/tutor?mode=quiz&q=${encodeURIComponent(topic.topic_name)}`}>
                      Practise
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </FlatSection>
        ) : null}

        {threads.length > 0 ? (
          <FlatSection title="Recent chats">
            <ul className="divide-y divide-stone">
              {threads.slice(0, MAX_RECENT_CHATS).map((t) => (
                <li key={t.id}>
                  <Link href={`/tutor/${t.id}`} className="-mx-3 flex items-center justify-between gap-3 rounded-lg px-3 py-3 hover:bg-stone-100">
                    <span className="flex min-w-0 items-center gap-3">
                      <MessageSquare size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden="true" />
                      <span className="truncate font-medium text-ink">{t.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-small text-ink-2">
                      {formatRelative(t.updated_at)}
                      <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </FlatSection>
        ) : null}

        {showScoreChart ? (
          <FlatSection title="Score history">
            <ScoreChart history={data.score_history} />
          </FlatSection>
        ) : null}

        {data.recent_activity.length > 0 ? (
          <FlatSection title="Recent quizzes" action={<Link href="/quizzes" className="text-sm font-medium text-accent-link underline-offset-4 hover:underline">All quizzes</Link>}>
            <ul className="divide-y divide-stone">
              {data.recent_activity.map((a) => (
                <li key={`${a.quiz_id}-${a.completed_at}`}>
                  <Link href={`/quizzes/${a.quiz_id}`} className="-mx-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-3 hover:bg-stone-100">
                    <span>
                      <span className="block font-medium text-ink">{a.topic ?? a.quiz_title}</span>
                      <span className="block text-small text-ink-2">{formatDate(a.completed_at)}</span>
                    </span>
                    <span className="text-sm font-medium text-ink">
                      {a.score} of {a.total_questions} correct ({a.percent}%)
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </FlatSection>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardView() {
  const greeting = useGreeting();
  const { data, error, loading, reload } = useApi(progressApi.summary);
  // The chat list is a bonus: if it fails the rest of the dashboard still shows
  const threads = useApi(tutorApi.threads);
  // Insights are a bonus too: without them the dashboard falls back to quiz data only
  const insights = useApi(progressApi.insights);
  return (
    <PageContainer full>
      {/* No primary button in the header: the next-step card holds the one primary action */}
      <PageHeader title={greeting} description="Here’s what to focus on next" />
      {loading ? <LoadingBlock label="Loading your dashboard" /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
      {data ? <Dashboard data={data} threads={threads.data ?? []} insights={insights.data} /> : null}
    </PageContainer>
  );
}
