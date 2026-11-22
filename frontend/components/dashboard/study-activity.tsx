"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DayActivity, StudyInsights } from "@/types/api";

/** "2026-11-22" as a local date, never shifted by UTC parsing */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const mondayIndex = (date: Date) => (date.getDay() + 6) % 7;
const total = (day: DayActivity) => day.questions + day.quizzes;
const dayLabel = (date: Date) => date.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" });

const LEVELS = ["bg-stone-100 ring-1 ring-inset ring-stone", "bg-clay-200", "bg-clay-300", "bg-clay", "bg-accent-ink"];

export function activityLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

function describe(day: DayActivity): string {
  const parts = [];
  if (day.questions) parts.push(`${day.questions} ${day.questions === 1 ? "question" : "questions"}`);
  if (day.quizzes) parts.push(`${day.quizzes} ${day.quizzes === 1 ? "quiz" : "quizzes"}`);
  return `${dayLabel(parseDay(day.date))}: ${parts.length ? parts.join(", ") : "no activity"}`;
}

/** Days studied in a row, and the last seven days as dots. */
export function StreakCard({ insights }: { insights: StudyInsights }) {
  const { current_streak: streak, longest_streak: longest, activity } = insights;
  const week = activity.slice(-7);
  const activeToday = total(activity[activity.length - 1]) > 0;
  const message =
    streak === 0
      ? "Ask one question a day to start a streak"
      : activeToday
        ? "You studied today. Come back tomorrow to keep it going"
        : "Ask a question today to keep your streak alive";

  return (
    <section aria-label="Study streak" className="flex h-full flex-col justify-between gap-6 rounded-panel border border-stone bg-paper p-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <Flame size={18} strokeWidth={1.75} className={cn(streak > 0 ? "text-warning" : "text-stone-strong")} aria-hidden="true" />
          Study streak
        </div>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-display font-semibold tracking-tight text-ink">{streak}</span>
          <span className="text-lg text-ink-2">{streak === 1 ? "day" : "days"}</span>
        </p>
        <p className="mt-1 text-sm text-ink-2">{message}</p>
      </div>

      <div>
        <ol className="flex justify-between gap-1" aria-label="Last seven days">
          {week.map((day, i) => {
            const date = parseDay(day.date);
            const active = total(day) > 0;
            const isToday = i === week.length - 1;
            return (
              <li key={day.date} className="flex flex-col items-center gap-1.5" title={describe(day)}>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-medium",
                    active ? "bg-clay-strong text-on-accent" : "bg-stone-100 text-ink-2",
                    isToday && "ring-2 ring-clay ring-offset-2 ring-offset-paper",
                  )}
                >
                  {date.getDate()}
                </span>
                <span className="text-xs text-ink-2">{date.toLocaleDateString("en", { weekday: "narrow" })}</span>
                <span className="sr-only">{describe(day)}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 border-t border-stone pt-3 text-small text-ink-2">
          Longest streak <span className="font-medium text-ink">{longest} {longest === 1 ? "day" : "days"}</span>
          <span aria-hidden="true"> · </span>
          <span className="font-medium text-ink">{insights.active_days}</span> study {insights.active_days === 1 ? "day" : "days"} in total
        </p>
      </div>
    </section>
  );
}

/** Twelve weeks of questions and quizzes, one square per day, Monday at the top. */
export function ActivityHeatmap({ insights }: { insights: StudyInsights }) {
  const days = insights.activity;
  const pad = mondayIndex(parseDay(days[0].date));
  const cells: (DayActivity | null)[] = [...Array<null>(pad).fill(null), ...days];
  const columns = Math.ceil(cells.length / 7);

  const windowQuestions = days.reduce((sum, d) => sum + d.questions, 0);
  const windowQuizzes = days.reduce((sum, d) => sum + d.quizzes, 0);
  const activeDays = days.filter((d) => total(d) > 0).length;
  const byWeekday = Array<number>(7).fill(0);
  for (const d of days) byWeekday[mondayIndex(parseDay(d.date))] += total(d);
  const busiest = Math.max(...byWeekday);
  const busiestDay = busiest > 0 ? ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][byWeekday.indexOf(busiest)] : null;

  // Month labels above the first column that starts in a new month
  const monthLabels = Array.from({ length: columns }, (_, col) => {
    const first = cells.slice(col * 7, col * 7 + 7).find((c): c is DayActivity => c !== null);
    if (!first) return "";
    const date = parseDay(first.date);
    const prev = col > 0 ? cells.slice((col - 1) * 7, col * 7).find((c): c is DayActivity => c !== null) : null;
    return !prev || parseDay(prev.date).getMonth() !== date.getMonth() ? date.toLocaleDateString("en", { month: "short" }) : "";
  });

  const stats = [
    { label: "Questions", value: windowQuestions },
    { label: "Quizzes", value: windowQuizzes },
    { label: "Active days", value: activeDays },
  ];

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
      <figure className="min-w-0">
        <div className="overflow-x-auto pb-1">
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `24px repeat(${columns}, 14px)` }}>
            <span />
            {monthLabels.map((label, i) => (
              <span key={i} className="h-4 overflow-visible whitespace-nowrap text-xs leading-4 text-ink-2">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            <div className="grid w-6 grid-rows-7 gap-1 text-xs leading-[14px] text-ink-2" aria-hidden="true">
              {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div
              className="grid grid-flow-col grid-rows-7 gap-1"
              role="img"
              aria-label={`Study activity over the last 12 weeks: ${windowQuestions} questions and ${windowQuizzes} quizzes on ${activeDays} days`}
            >
              {cells.map((cell, i) =>
                cell ? (
                  <span
                    key={cell.date}
                    title={describe(cell)}
                    className={cn("size-[14px] rounded-[3px]", LEVELS[activityLevel(total(cell))], cell.date === insights.today && "outline outline-2 outline-offset-1 outline-ink")}
                  />
                ) : (
                  <span key={`pad-${i}`} className="size-[14px]" />
                ),
              )}
            </div>
          </div>
        </div>
        <figcaption className="mt-3 flex items-center gap-2 text-xs text-ink-2">
          Less
          {LEVELS.map((level) => (
            <span key={level} className={cn("size-3 rounded-[3px]", level)} aria-hidden="true" />
          ))}
          More
        </figcaption>
      </figure>

      <dl className="grid shrink-0 grid-cols-3 gap-4 sm:w-44 sm:grid-cols-1">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-small text-ink-2">{s.label}</dt>
            <dd className="text-page font-semibold tracking-tight text-ink">{s.value}</dd>
          </div>
        ))}
        {busiestDay ? (
          <div className="col-span-3 sm:col-span-1">
            <dt className="text-small text-ink-2">You study most on</dt>
            <dd className="font-medium text-ink">{busiestDay}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
