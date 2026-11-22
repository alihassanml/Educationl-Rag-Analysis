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
import type { ProgressSummary, ThreadSummary } from "@/types/api";

const MAX_REVISION_ROWS = 5;
const MAX_RECENT_CHATS = 4;

type Step = { title: string; hint: string; done: boolean; href: string; action: string };

/** First-run checklist. Every done state comes from real API data. */
function Checklist({ data, threads }: { data: ProgressSummary; threads: ThreadSummary[] }) {
  const steps: Step[] = [
    { title: "Upload a PDF", hint: "Notes, slides or a chapter. It stays private to your account", done: data.documents_total > 0, href: "/library", action: "Upload PDF" },
    { title: "Ask your first question", hint: "The answer cites the document and page it came from", done: threads.length > 0, href: "/tutor", action: "Ask a question" },
    { title: "Take a quiz", hint: "Quiz results show which topics to revise next", done: data.quizzes_completed > 0, href: "/quizzes", action: "Start a quiz" },
  ];
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="rounded-panel border border-stone bg-paper p-6 shadow-sm lg:col-span-8">
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
    <section className="flex h-full flex-col justify-between rounded-panel border border-stone border-l-[3px] border-l-clay bg-paper p-6 shadow-sm lg:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Recommended next step</p>
        <h2 className="mt-3 text-h1 font-medium tracking-tight text-ink">{body.title}</h2>
        <p className="mt-2 max-w-prose text-base text-ink-2">{body.reason}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {body.primary}
        {body.secondary}
      </div>
    </section>
  );
}

/** Where the last conversation stopped, so the tutor is one click away. */
function ContinueChat({ threads }: { threads: ThreadSummary[] }) {
  const last = threads[0];
  return (
    <section aria-label="Study tutor" className="flex h-full flex-col justify-between rounded-panel bg-stone-100 p-6 lg:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">{last ? "Pick up where you left off" : "Study tutor"}</p>
        <h2 className="mt-3 line-clamp-2 text-lg font-semibold text-ink">{last ? last.title : "Ask about your material"}</h2>
        <p className="mt-1 text-ink-2">
          {last ? `Last active ${formatRelative(last.updated_at)}` : "Answers cite the document and page they came from"}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink variant="secondary" href={last ? `/tutor/${last.id}` : "/tutor"}>
          {last ? "Continue chat" : "Ask a question"}
        </ButtonLink>
        {last ? (
          <ButtonLink variant="ghost" href="/tutor">
            New chat
          </ButtonLink>
        ) : null}
      </div>
    </section>
  );
}

function StatStrip({ data }: { data: ProgressSummary }) {
  const average = data.average_score_percent;
  const cells = [
    { label: "Documents ready", value: data.documents_ready, context: `of ${data.documents_total} uploaded` },
    { label: "Quizzes completed", value: data.quizzes_completed === 0 ? null : data.quizzes_completed, context: "finished attempts" },
    { label: "Average quiz score", value: average === null ? null : `${average}%`, context: `from ${data.quizzes_completed} ${data.quizzes_completed === 1 ? "quiz" : "quizzes"}` },
    { label: "Topics needing revision", value: data.quizzes_completed === 0 ? null : data.topics_needing_revision, context: "under the revision threshold" },
  ];
  return (
    <section aria-label="Snapshot" className="grid grid-cols-2 gap-px overflow-hidden rounded-panel bg-stone lg:grid-cols-4">
      {cells.map((cell) => (
        <StatTile key={cell.label} bare className="bg-stone-100 p-5 lg:px-8 lg:py-6" label={cell.label} value={cell.value} context={cell.context} />
      ))}
    </section>
  );
}

function Dashboard({ data, threads }: { data: ProgressSummary; threads: ThreadSummary[] }) {
  const isNew = data.documents_total === 0 && data.quizzes_completed === 0;
  if (isNew) return <Checklist data={data} threads={threads} />;

  const revision = data.needs_revision.slice(0, MAX_REVISION_ROWS);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-8">
          <NextStep data={data} />
        </div>
        <div className="lg:col-span-4">
          <ContinueChat threads={threads} />
        </div>
      </div>

      <StatStrip data={data} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-7">
          <FlatSection
            title="Needs revision"
            action={revision.length > 0 ? <Link href="/progress" className="text-sm font-medium text-clay-strong underline-offset-4 hover:underline">View all progress</Link> : undefined}
          >
            {revision.length === 0 ? (
              <p className="text-ink-2">No topics need revision right now</p>
            ) : (
              <ul className="divide-y divide-stone">
                {revision.map((topic) => (
                  <li key={topic.topic_id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <TopicRow topic={topic} compact />
                    </div>
                    <ButtonLink size="sm" variant="secondary" className="self-start sm:self-center" href={`/quizzes?topic=${encodeURIComponent(topic.topic_name)}`}>
                      Practise
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </FlatSection>

          {data.score_history.length >= MIN_POINTS_FOR_CHART ? (
            <FlatSection title="Score history">
              <ScoreChart history={data.score_history} />
            </FlatSection>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-8 lg:col-span-5">
          <FlatSection title="Recent quizzes" action={<Link href="/quizzes" className="text-sm font-medium text-clay-strong underline-offset-4 hover:underline">All quizzes</Link>}>
            {data.recent_activity.length === 0 ? (
              <p className="text-ink-2">No completed quizzes yet</p>
            ) : (
              <ul className="divide-y divide-stone">
                {data.recent_activity.map((a) => (
                  <li key={`${a.quiz_id}-${a.completed_at}`}>
                    <Link href={`/quizzes/${a.quiz_id}`} className="-mx-3 flex flex-wrap items-center justify-between gap-2 rounded-control px-3 py-3 hover:bg-stone-100">
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
            )}
          </FlatSection>

          <FlatSection title="Recent chats" action={<Link href="/tutor" className="text-sm font-medium text-clay-strong underline-offset-4 hover:underline">New chat</Link>}>
            {threads.length === 0 ? (
              <p className="text-ink-2">Your questions to the tutor are saved here</p>
            ) : (
              <ul className="divide-y divide-stone">
                {threads.slice(0, MAX_RECENT_CHATS).map((t) => (
                  <li key={t.id}>
                    <Link href={`/tutor/${t.id}`} className="-mx-3 flex items-center justify-between gap-3 rounded-control px-3 py-3 hover:bg-stone-100">
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
            )}
          </FlatSection>
        </div>
      </div>
    </div>
  );
}

export function DashboardView() {
  const greeting = useGreeting();
  const { data, error, loading, reload } = useApi(progressApi.summary);
  // The chat list is a bonus: if it fails the rest of the dashboard still shows
  const threads = useApi(tutorApi.threads);
  return (
    // theme-sky (styles/theme-sky.css) re-points the colour tokens for this page only
    <div className="theme-sky min-h-screen">
      <PageContainer full>
        {/* No primary button in the header: the next-step card holds the one primary action */}
        <PageHeader title={greeting} description="Here’s what to focus on next" />
        {loading ? <LoadingBlock label="Loading your dashboard" /> : null}
        {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
        {data ? <Dashboard data={data} threads={threads.data ?? []} /> : null}
      </PageContainer>
    </div>
  );
}
