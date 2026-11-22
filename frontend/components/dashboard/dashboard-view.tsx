"use client";

import {
  ArrowRight,
  Check,
  Circle,
  FileStack,
  LineChart,
  ListChecks,
  MessageSquare,
  ShieldCheck,
  Target,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
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
import { cardLinkClass, DashCard, IconChip } from "./dash-card";
import { LibraryCard, MAX_ROWS, QuickActionsCard, TopPagesCard } from "./library-insights";
import { ActivityCard, StreakCard } from "./study-activity";


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
    <section className="flex h-full flex-col justify-between gap-6 rounded-panel bg-clay-300 p-6 lg:p-8">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-2">Recommended next step</p>
        <h2 className="mt-2 line-clamp-2 text-h1 font-semibold tracking-tight text-ink lg:text-h1-lg">{body.title}</h2>
        <p className="mt-2 line-clamp-2 max-w-prose text-ink">{body.reason}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {body.primary}
        {body.secondary}
      </div>
    </section>
  );
}

type Kpi = { label: string; value: string | number; context: string; icon: LucideIcon };

/** Only numbers that exist: a tile with a dash helps nobody. */
function kpisFor(data: ProgressSummary, insights: StudyInsights | null): Kpi[] {
  const kpis: Kpi[] = [];
  if (insights && insights.questions_asked > 0) {
    kpis.push({ label: "Questions asked", value: insights.questions_asked, context: `${insights.active_days} study ${insights.active_days === 1 ? "day" : "days"}`, icon: MessageSquare });
    const answered = insights.answers_with_sources + insights.answers_not_found;
    if (answered > 0) {
      kpis.push({ label: "Answers with sources", value: `${Math.round((insights.answers_with_sources / answered) * 100)}%`, context: `${insights.citations_total} page citations`, icon: ShieldCheck });
    }
  }
  if (insights && insights.pages_indexed > 0) {
    kpis.push({ label: "Pages indexed", value: insights.pages_indexed, context: `${data.documents_ready} ${data.documents_ready === 1 ? "document" : "documents"}`, icon: FileStack });
  }
  if (data.average_score_percent !== null && data.quizzes_completed > 0) {
    kpis.push({ label: "Average quiz score", value: `${data.average_score_percent}%`, context: `${data.quizzes_completed} ${data.quizzes_completed === 1 ? "quiz" : "quizzes"}`, icon: Target });
  }
  if (!insights && data.quizzes_completed > 0) {
    kpis.unshift({ label: "Documents ready", value: data.documents_ready, context: `of ${data.documents_total} uploaded`, icon: FileStack });
    kpis.push({ label: "Topics to revise", value: data.topics_needing_revision, context: "below the threshold", icon: TrendingDown });
  }
  return kpis;
}

const KPI_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <section aria-label="Snapshot" className={cn("grid grid-cols-2 gap-3 sm:gap-4", KPI_COLS[kpis.length])}>
      {kpis.map(({ label, value, context, icon }) => (
        <div key={label} className="flex min-w-0 flex-col gap-3 rounded-panel border border-stone bg-paper p-4 [&:last-child:nth-child(odd)]:col-span-2 lg:[&:last-child:nth-child(odd)]:col-span-1 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
          <IconChip icon={icon} className="sm:size-10" />
          <div className="min-w-0">
            <p className="text-sm text-ink-2">{label}</p>
            <p className="mt-1 text-page font-semibold tracking-tight text-ink">{value}</p>
            <p className="truncate text-small text-ink-2">{context}</p>
          </div>
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

/** The cards below the main rows, laid out two per row; an odd last card takes the full width. */
function secondaryCards(data: ProgressSummary, threads: ThreadSummary[], withQuickActions: boolean): { key: string; node: ReactNode }[] {
  const cards: { key: string; node: ReactNode }[] = [];
  const revision = data.needs_revision.slice(0, MAX_ROWS);

  if (withQuickActions) cards.push({ key: "quick", node: <QuickActionsCard latestDocId={data.latest_document?.id ?? null} /> });

  if (data.quizzes_completed > 0) {
    cards.push({
      key: "revision",
      node: (
        <DashCard
          title="Needs revision"
          icon={TrendingDown}
          action={
            revision.length > 0 ? (
              <Link href="/progress" className={cardLinkClass}>
                View all progress
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
      ),
    });
  }

  if (threads.length > 0) {
    cards.push({
      key: "chats",
      node: (
        <DashCard title="Recent chats" icon={MessageSquare}>
          <ul className="divide-y divide-stone">
            {threads.slice(0, MAX_ROWS).map((t) => (
              <li key={t.id}>
                <RowLink href={`/tutor/${t.id}`} meta={formatRelative(t.updated_at)}>
                  <span className="block truncate font-medium text-ink">{t.title}</span>
                </RowLink>
              </li>
            ))}
          </ul>
        </DashCard>
      ),
    });
  }

  if (data.recent_activity.length > 0) {
    cards.push({
      key: "quizzes",
      node: (
        <DashCard
          title="Recent quizzes"
          icon={ListChecks}
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
                  <span className="block truncate font-medium text-ink">{a.topic ?? a.quiz_title}</span>
                  <span className="block text-small text-ink-2">
                    {a.score} of {a.total_questions} correct · {formatDate(a.completed_at)}
                  </span>
                </RowLink>
              </li>
            ))}
          </ul>
        </DashCard>
      ),
    });
  }

  if (data.score_history.length >= MIN_POINTS_FOR_CHART) {
    cards.push({
      key: "scores",
      node: (
        <DashCard title="Score trend" icon={LineChart}>
          <ScoreChart history={data.score_history} />
        </DashCard>
      ),
    });
  }
  return cards;
}

function Dashboard({ data, threads, insights }: { data: ProgressSummary; threads: ThreadSummary[]; insights: StudyInsights | null }) {
  const isNew = data.documents_total === 0 && data.quizzes_completed === 0;
  if (isNew) return <Checklist data={data} threads={threads} />;

  const kpis = kpisFor(data, insights);
  const cards = secondaryCards(data, threads, !insights);
  const hasDocs = (insights?.documents.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={insights ? "lg:col-span-2" : "lg:col-span-3"}>
          <NextStep data={data} />
        </div>
        {insights ? <StreakCard insights={insights} /> : null}
      </div>

      {kpis.length > 0 ? <KpiRow kpis={kpis} /> : null}

      {insights ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivityCard insights={insights} />
          </div>
          <QuickActionsCard latestDocId={data.latest_document?.id ?? null} />
          {hasDocs ? (
            <div className="lg:col-span-2">
              <LibraryCard documents={insights.documents} />
            </div>
          ) : null}
          <div className={hasDocs ? undefined : "lg:col-span-3"}>
            <TopPagesCard pages={insights.hot_pages} />
          </div>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {cards.map((card, i) => (
            <div key={card.key} className={cn(i === cards.length - 1 && cards.length % 2 === 1 && "lg:col-span-2")}>
              {card.node}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardView() {
  const greeting = useGreeting();
  const { data, error, loading, reload } = useApi(progressApi.summary);
  // The chat list and insights are a bonus: if either fails the rest of the dashboard still shows
  const threads = useApi(tutorApi.threads);
  const insights = useApi(progressApi.insights);
  return (
    <PageContainer full>
      {/* No primary button in the header: the next-step card holds the one primary action */}
      <PageHeader title={greeting} />
      {loading ? <LoadingBlock label="Loading your dashboard" /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
      {data ? <Dashboard data={data} threads={threads.data ?? []} insights={insights.data} /> : null}
    </PageContainer>
  );
}
