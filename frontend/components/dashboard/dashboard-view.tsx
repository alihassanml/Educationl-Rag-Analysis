"use client";

import { ArrowRight, Check, Circle, Plus } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScoreChart, MIN_POINTS_FOR_CHART } from "@/components/progress/score-chart";
import { TopicRow } from "@/components/progress/topic-row";
import { ButtonLink } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { progressApi, tutorApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/formatters";
import { useGreeting } from "@/lib/greeting";
import { formatRelative } from "@/lib/relative-time";
import { useApi } from "@/lib/use-api";
import type { ProgressSummary, StudyInsights, ThreadSummary } from "@/types/api";
import { cardLinkClass, DashCard } from "./dash-card";
import { LibraryCard, MAX_ROWS, TopPagesCard } from "./library-insights";
import { ActivityCard, streakStatus } from "./study-activity";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-panel border border-stone bg-paper p-5 lg:col-span-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold text-ink">Get started in three steps</h2>
          <p className="text-sm text-ink-2">
            {done} of {steps.length} done
          </p>
        </div>
        <ol className="mt-4 divide-y divide-stone">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <span className="flex items-start gap-3">
                {step.done ? (
                  <Check size={18} strokeWidth={2} className="mt-0.5 text-success" aria-hidden="true" />
                ) : (
                  <Circle size={18} strokeWidth={1.75} className="mt-0.5 text-stone-strong" aria-hidden="true" />
                )}
                <span>
                  <span className={cn("block font-medium", step.done ? "text-ink-2 line-through" : "text-ink")}>{step.title}</span>
                  <span className="block text-small text-ink-2">{step.hint}</span>
                  {step.done ? <span className="sr-only">Done</span> : null}
                </span>
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

      <section aria-label="What you get" className="rounded-panel bg-stone-100 p-5">
        <h2 className="text-base font-semibold text-ink">What you get</h2>
        <ul className="mt-4 space-y-4 text-sm text-ink">
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

/** The one recommended action, as a compact banner: what, why, and the two ways to act on it. */
function NextStep({ data }: { data: ProgressSummary }) {
  const next = data.next_step;
  const body = next
    ? {
        title: next.topic_name,
        reason: next.recommendation.message,
        primary: <ButtonLink href={`/tutor?mode=quiz&q=${encodeURIComponent(next.topic_name)}`}>Practise this topic</ButtonLink>,
        secondary: (
          <ButtonLink variant="secondary" href={`/tutor?q=${encodeURIComponent(`Explain ${next.topic_name} in simple words`)}`}>
            Ask the tutor about this
          </ButtonLink>
        ),
      }
    : data.latest_document
      ? {
          title: data.latest_document.title,
          reason: "Ready to study. Take a quiz to find your weak topics.",
          primary: <ButtonLink href="/tutor?mode=quiz">Create your first quiz</ButtonLink>,
          secondary: (
            <ButtonLink variant="secondary" href="/tutor">
              Ask the tutor
            </ButtonLink>
          ),
        }
      : { title: "Add your first document", reason: "Upload a document to start studying.", primary: <ButtonLink href="/library">Upload PDF</ButtonLink>, secondary: null };

  return (
    <section className="flex flex-col gap-5 rounded-panel bg-clay-300 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-small font-medium text-accent-ink">Recommended next step</p>
        <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-ink">{body.title}</h2>
        <p className="mt-1 line-clamp-2 max-w-prose text-sm text-ink">{body.reason}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {body.primary}
        {body.secondary}
      </div>
    </section>
  );
}

type Stat = { label: string; value: string | number; context: string };

/** Only numbers that exist: a tile with a dash or a zero helps nobody. */
function statsFor(data: ProgressSummary, insights: StudyInsights | null): Stat[] {
  const stats: Stat[] = [];
  if (insights && insights.questions_asked > 0) {
    stats.push({ label: "Study streak", value: plural(insights.current_streak, "day"), context: `${streakStatus(insights)} · best ${plural(insights.longest_streak, "day")}` });
    stats.push({ label: "Questions asked", value: insights.questions_asked, context: `on ${plural(insights.active_days, "study day")}` });
    const answered = insights.answers_with_sources + insights.answers_not_found;
    if (answered > 0) {
      stats.push({ label: "Answers with sources", value: `${Math.round((insights.answers_with_sources / answered) * 100)}%`, context: plural(insights.citations_total, "page citation") });
    }
  }
  if (insights && insights.pages_indexed > 0) {
    stats.push({ label: "Pages indexed", value: insights.pages_indexed, context: `in ${plural(data.documents_ready, "document")}` });
  }
  if (data.average_score_percent !== null && data.quizzes_completed > 0) {
    stats.push({ label: "Average quiz score", value: `${data.average_score_percent}%`, context: `over ${plural(data.quizzes_completed, "quiz", "quizzes")}` });
  }
  if (!insights && data.quizzes_completed > 0) {
    stats.unshift({ label: "Documents ready", value: data.documents_ready, context: `of ${data.documents_total} uploaded` });
    stats.push({ label: "Topics to revise", value: data.topics_needing_revision, context: "below the threshold" });
  }
  return stats;
}

const STAT_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };

/** Key numbers in one framed strip, split by hairlines instead of a card per number. */
function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <section aria-label="Snapshot" className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-stone bg-stone [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1", STAT_COLS[stats.length])}>
      {stats.map(({ label, value, context }) => (
        <div key={label} className="min-w-0 bg-paper px-5 py-4">
          <p className="truncate text-small text-ink-2">{label}</p>
          <p className="mt-1 text-page font-semibold tracking-tight text-ink">{value}</p>
          <p className="truncate text-small text-ink-2">{context}</p>
        </div>
      ))}
    </section>
  );
}

function RowLink({ href, children, meta }: { href: string; children: ReactNode; meta: ReactNode }) {
  return (
    <Link href={href} className="-mx-2 flex items-center justify-between gap-3 rounded-control px-2 py-2.5 hover:bg-stone-100">
      <span className="min-w-0 flex-1">{children}</span>
      <span className="flex shrink-0 items-center gap-2 text-small text-ink-2">
        {meta}
        <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
      </span>
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
              <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
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
            View progress
          </Link>
        ) : undefined
      }
    >
      {revision.length === 0 ? (
        <p className="text-sm text-ink-2">No topics need revision right now.</p>
      ) : (
        <ul className="divide-y divide-stone">
          {revision.map((topic) => (
            <li key={topic.topic_id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <TopicRow topic={topic} compact hideStatus />
              </div>
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
            <RowLink href={`/quizzes/${a.quiz_id}`} meta={<span className="font-medium text-ink">{a.percent}%</span>}>
              <span className="block truncate text-sm font-medium text-ink">{a.topic ?? a.quiz_title}</span>
              <span className="block text-small text-ink-2">
                {a.score} of {a.total_questions} correct · {formatDate(a.completed_at)}
              </span>
            </RowLink>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

function Dashboard({ data, threads, insights }: { data: ProgressSummary; threads: ThreadSummary[]; insights: StudyInsights | null }) {
  const isNew = data.documents_total === 0 && data.quizzes_completed === 0;
  if (isNew) return <Checklist data={data} threads={threads} />;

  const stats = statsFor(data, insights);
  const hasDocs = (insights?.documents.length ?? 0) > 0;
  const scores = data.score_history.length >= MIN_POINTS_FOR_CHART;

  // Wide column: what you did and what you have. Narrow column: where to pick up again.
  const main: { key: string; node: ReactNode }[] = [];
  if (insights) main.push({ key: "activity", node: <ActivityCard insights={insights} /> });
  if (hasDocs && insights) main.push({ key: "library", node: <LibraryCard documents={insights.documents} /> });
  if (scores) main.push({ key: "scores", node: <DashCard title="Score trend"><ScoreChart history={data.score_history} /></DashCard> });

  const side: { key: string; node: ReactNode }[] = [];
  if (threads.length > 0) side.push({ key: "chats", node: <RecentChats threads={threads} /> });
  if (data.quizzes_completed > 0) side.push({ key: "revision", node: <NeedsRevision data={data} /> });
  if (data.recent_activity.length > 0) side.push({ key: "quizzes", node: <RecentQuizzes data={data} /> });
  if (insights) side.push({ key: "pages", node: <TopPagesCard pages={insights.hot_pages} /> });

  // With nothing for the wide column, the side cards share the full width instead
  const columns = main.length > 0 && side.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <NextStep data={data} />
      {stats.length > 0 ? <StatStrip stats={stats} /> : null}
      <div className={cn("grid grid-cols-1 gap-6", columns ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {columns ? (
          <>
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              {main.map((m) => (
                <div key={m.key}>{m.node}</div>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              {side.map((s) => (
                <div key={s.key}>{s.node}</div>
              ))}
            </div>
          </>
        ) : (
          [...main, ...side].map((c) => <div key={c.key}>{c.node}</div>)
        )}
      </div>
    </div>
  );
}

export function DashboardView() {
  const greeting = useGreeting();
  const { data, error, loading, reload } = useApi(progressApi.summary);
  // The chat list and insights are a bonus: if either fails the rest of the dashboard still shows
  const threads = useApi(tutorApi.threads);
  const insights = useApi(progressApi.insights);
  const returning = data !== null && (data.documents_total > 0 || data.quizzes_completed > 0);
  return (
    <PageContainer>
      <PageHeader
        title={greeting}
        description="Your study at a glance"
        action={
          returning ? (
            <ButtonLink href="/library" variant="secondary">
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Add material
            </ButtonLink>
          ) : undefined
        }
      />
      {loading ? <LoadingBlock label="Loading your dashboard" /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
      {data ? <Dashboard data={data} threads={threads.data ?? []} insights={insights.data} /> : null}
    </PageContainer>
  );
}
