"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScoreChart, MIN_POINTS_FOR_CHART } from "@/components/progress/score-chart";
import { ButtonLink } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { CurrentStepCard } from "@/components/course-map/current-step-card";
import { DiagnosticCard } from "@/components/diagnostic/diagnostic-card";
import { diagnosticApi, pathApi, progressApi, remindersApi, tutorApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useGreeting } from "@/lib/greeting";
import { formatRelative } from "@/lib/relative-time";
import { useApi } from "@/lib/use-api";
import type { DiagnosticStatus, DueTopic, LearningPath, ProgressSummary, StudyInsights, ThreadSummary } from "@/types/api";
import { cardLinkClass, DashCard } from "./dash-card";
import { LibraryCard, MAX_ROWS } from "./library-insights";
import { ActivityCard } from "./study-activity";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Step = { title: string; done: boolean; href: string; action: string };

/** First-run checklist: three steps, each with the one thing to do. Every done state is real data. */
function Checklist({ data, threads }: { data: ProgressSummary; threads: ThreadSummary[] }) {
  const steps: Step[] = [
    { title: "Upload a PDF", done: data.documents_total > 0, href: "/library", action: "Upload PDF" },
    { title: "Ask a question", done: threads.length > 0, href: "/tutor", action: "Ask a question" },
    { title: "Take a quiz", done: data.quizzes_completed > 0, href: "/tutor?mode=quiz", action: "Start a quiz" },
  ];
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);

  return (
    <section className="rounded-panel border border-stone bg-paper p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink">Get started in three steps</h2>
        <p className="text-ink-2">
          {done} of {steps.length} done
        </p>
      </div>
      <ol className="mt-3 divide-y divide-stone">
        {steps.map((step, i) => (
          <li key={step.title} className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <span className="flex items-center gap-3">
              <span className={cn("flex size-7 items-center justify-center rounded-full text-sm font-semibold", step.done ? "bg-success-soft text-success" : "bg-stone-100 text-ink-2")}>{i + 1}</span>
              <span className={cn("font-medium", step.done ? "text-ink-2 line-through" : "text-ink")}>{step.title}</span>
              {step.done ? <span className="sr-only">Done</span> : null}
            </span>
            {!step.done ? (
              <ButtonLink href={step.href} size="sm" variant={i === current ? "primary" : "secondary"}>
                {step.action}
              </ButtonLink>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The one recommended action: what, one line of why, and the two ways to act. */
function NextStep({ data }: { data: ProgressSummary }) {
  const next = data.next_step;
  const body = next
    ? {
        title: next.topic_name,
        reason: next.recommendation.message,
        primary: <ButtonLink href={`/tutor?mode=quiz&q=${encodeURIComponent(next.topic_name)}`}>Practise</ButtonLink>,
        secondary: (
          <ButtonLink variant="secondary" href={`/tutor?q=${encodeURIComponent(`Explain ${next.topic_name} in simple words`)}`}>
            Ask the tutor
          </ButtonLink>
        ),
      }
    : data.latest_document
      ? {
          title: data.latest_document.title,
          reason: "Take a quiz to find your weak topics.",
          primary: <ButtonLink href="/tutor?mode=quiz">Create your first quiz</ButtonLink>,
          secondary: (
            <ButtonLink variant="secondary" href="/tutor">
              Ask the tutor
            </ButtonLink>
          ),
        }
      : { title: "Add your first document", reason: "Upload a document to start studying.", primary: <ButtonLink href="/library">Upload PDF</ButtonLink>, secondary: null };

  return (
    <section className="flex flex-col gap-4 rounded-panel bg-clay-300 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-accent-ink">Next step</p>
        <h2 className="truncate text-2xl font-semibold tracking-tight text-ink">{body.title}</h2>
        <p className="line-clamp-1 text-ink">{body.reason}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {body.primary}
        {body.secondary}
      </div>
    </section>
  );
}

type Stat = { label: string; value: string | number };

/** Only numbers that exist: a tile with a dash or a zero helps nobody. */
function statsFor(data: ProgressSummary, insights: StudyInsights | null): Stat[] {
  const stats: Stat[] = [];
  if (insights && insights.questions_asked > 0) {
    stats.push({ label: "Study streak", value: plural(insights.current_streak, "day") });
    stats.push({ label: "Questions asked", value: insights.questions_asked });
  }
  if (insights && insights.pages_indexed > 0) stats.push({ label: "Pages indexed", value: insights.pages_indexed });
  if (data.average_score_percent !== null && data.quizzes_completed > 0) stats.push({ label: "Average quiz score", value: `${data.average_score_percent}%` });
  if (!insights && data.quizzes_completed > 0) {
    stats.unshift({ label: "Documents ready", value: data.documents_ready });
    stats.push({ label: "Topics to revise", value: data.topics_needing_revision });
  }
  return stats;
}

const STAT_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/** Key numbers in one framed strip, split by hairlines instead of a card per number. */
function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <section aria-label="Snapshot" className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-stone bg-stone [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1", STAT_COLS[stats.length])}>
      {stats.map(({ label, value }) => (
        <div key={label} className="min-w-0 bg-paper px-5 py-4">
          <p className="truncate text-ink-2">{label}</p>
          <p className="text-metric font-semibold tracking-tight text-ink">{value}</p>
        </div>
      ))}
    </section>
  );
}

function RowLink({ href, children, meta }: { href: string; children: ReactNode; meta: ReactNode }) {
  return (
    <Link href={href} className="-mx-2 flex items-center justify-between gap-3 rounded-control px-2 py-2.5 hover:bg-stone-100">
      <span className="min-w-0 flex-1 truncate font-medium text-ink">{children}</span>
      <span className="shrink-0 text-ink-2">{meta}</span>
    </Link>
  );
}

function RecentChats({ threads }: { threads: ThreadSummary[] }) {
  return (
    <DashCard
      title="Recent chats"
      action={
        <Link href="/history" className={cardLinkClass}>
          All chats
        </Link>
      }
    >
      <ul className="divide-y divide-stone">
        {threads.slice(0, MAX_ROWS).map((t) => (
          <li key={t.id}>
            <RowLink href={`/tutor/${t.id}`} meta={formatRelative(t.updated_at)}>
              {t.title}
            </RowLink>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

function NeedsRevision({ data }: { data: ProgressSummary }) {
  const revision = data.needs_revision.slice(0, MAX_ROWS);
  return (
    <DashCard
      title="Needs revision"
      action={
        revision.length > 0 ? (
          <Link href="/progress" className={cardLinkClass}>
            Progress
          </Link>
        ) : undefined
      }
    >
      {revision.length === 0 ? (
        <p className="text-ink-2">Nothing to revise.</p>
      ) : (
        <ul className="divide-y divide-stone">
          {revision.map((topic) => (
            <li key={topic.topic_id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{topic.topic_name}</span>
              {topic.accuracy_percent !== null ? <span className="shrink-0 text-ink-2">{topic.accuracy_percent}%</span> : null}
              <ButtonLink size="sm" variant="secondary" href={`/tutor?mode=quiz&q=${encodeURIComponent(topic.topic_name)}`}>
                Practise
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

function RecentQuizzes({ data }: { data: ProgressSummary }) {
  return (
    <DashCard
      title="Recent quizzes"
      action={
        <Link href="/quizzes" className={cardLinkClass}>
          All quizzes
        </Link>
      }
    >
      <ul className="divide-y divide-stone">
        {data.recent_activity.slice(0, MAX_ROWS).map((a) => (
          <li key={`${a.quiz_id}-${a.completed_at}`}>
            <RowLink href={`/quizzes/${a.quiz_id}`} meta={<span className="font-semibold text-ink">{a.percent}%</span>}>
              {a.topic ?? a.quiz_title}
            </RowLink>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

/** A reminder strip: one sentence and one button. */
function DueToday({ dueTopics }: { dueTopics: DueTopic[] }) {
  if (dueTopics.length === 0) return null;
  const first = dueTopics[0];
  return (
    <section aria-label="Due for review" className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-stone bg-paper p-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Slip test: {first.topic_name}</h2>
        <p className="text-ink-2">{dueTopics.length > 1 ? `${dueTopics.length} topics due` : "3 questions, about 2 minutes"}</p>
      </div>
      <ButtonLink href={`/tutor?mode=quiz&q=${encodeURIComponent(first.topic_name)}`}>Start</ButtonLink>
    </section>
  );
}

function Dashboard({ data, threads, insights, diagnostic, path, dueTopics }: { data: ProgressSummary; threads: ThreadSummary[]; insights: StudyInsights | null; diagnostic: DiagnosticStatus | null; path: LearningPath | null; dueTopics: DueTopic[] }) {
  const isNew = data.documents_total === 0 && data.quizzes_completed === 0;
  if (isNew) return <Checklist data={data} threads={threads} />;

  const stats = statsFor(data, insights);
  const hasDocs = (insights?.documents.length ?? 0) > 0;
  const scores = data.score_history.length >= MIN_POINTS_FOR_CHART;

  // Every card has the same width and padding, two to a row, so the rows line up
  const cards: { key: string; node: ReactNode }[] = [];
  if (path && path.steps.length > 0) cards.push({ key: "path", node: <CurrentStepCard path={path} /> });
  if (data.quizzes_completed > 0) cards.push({ key: "revision", node: <NeedsRevision data={data} /> });
  if (threads.length > 0) cards.push({ key: "chats", node: <RecentChats threads={threads} /> });
  if (data.recent_activity.length > 0) cards.push({ key: "quizzes", node: <RecentQuizzes data={data} /> });
  if (hasDocs && insights) cards.push({ key: "library", node: <LibraryCard documents={insights.documents} /> });
  if (scores) cards.push({ key: "scores", node: <DashCard title="Score trend"><ScoreChart history={data.score_history} /></DashCard> });

  return (
    <div className="flex flex-col gap-4">
      <DueToday dueTopics={dueTopics} />
      <NextStep data={data} />
      {diagnostic?.suggested ? <DiagnosticCard status={diagnostic} /> : null}
      {stats.length > 0 ? <StatStrip stats={stats} /> : null}
      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0 [&>*>section]:h-full">
          {cards.map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </div>
      ) : null}
      {insights ? <ActivityCard insights={insights} /> : null}
    </div>
  );
}

export function DashboardView() {
  const greeting = useGreeting();
  const { data, error, loading, reload } = useApi(progressApi.summary);
  // The chat list and insights are a bonus: if either fails the rest of the dashboard still shows
  const threads = useApi(tutorApi.threads);
  const insights = useApi(progressApi.insights);
  const diagnostic = useApi(diagnosticApi.status);
  const path = useApi(pathApi.get);
  const due = useApi(remindersApi.dueTopics);
  const returning = data !== null && (data.documents_total > 0 || data.quizzes_completed > 0);
  return (
    <PageContainer>
      <PageHeader
        title={greeting}
        action={
          returning ? (
            <ButtonLink href="/library" variant="secondary">
              Add material
            </ButtonLink>
          ) : undefined
        }
      />
      {loading ? <LoadingBlock label="Loading your dashboard" /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
      {data ? <Dashboard data={data} threads={threads.data ?? []} insights={insights.data} diagnostic={diagnostic.data} path={path.data} dueTopics={due.data ?? []} /> : null}
    </PageContainer>
  );
}
