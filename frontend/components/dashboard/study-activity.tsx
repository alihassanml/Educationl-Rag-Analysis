"use client";

import { CalendarDays, Flame } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DayActivity, StudyInsights } from "@/types/api";
import { DashCard } from "./dash-card";

/** "2026-11-22" as a local date, never shifted by UTC parsing */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const mondayIndex = (date: Date) => (date.getDay() + 6) % 7;
const total = (day: DayActivity) => day.questions + day.quizzes;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const LEVELS = ["bg-stone-100", "bg-clay-200", "bg-clay-300", "bg-clay", "bg-accent-ink"];

export function activityLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

function describe(day: DayActivity): string {
  const date = parseDay(day.date).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" });
  const parts = [day.questions ? plural(day.questions, "question") : "", day.quizzes ? `${day.quizzes} ${day.quizzes === 1 ? "quiz" : "quizzes"}` : ""].filter(Boolean);
  return `${date}: ${parts.length ? parts.join(", ") : "no activity"}`;
}

/** Days studied in a row, and the last seven days as dots. */
export function StreakCard({ insights }: { insights: StudyInsights }) {
  const { current_streak: streak, longest_streak: longest, activity } = insights;
  const week = activity.slice(-7);
  const activeToday = total(activity[activity.length - 1]) > 0;
  const status = streak === 0 ? "Start today" : activeToday ? "Done today" : "Study today to keep it";

  return (
    <DashCard
      title="Study streak"
      icon={Flame}
      action={<span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", activeToday ? "bg-success-soft text-success" : "bg-clay-soft text-accent-ink")}>{status}</span>}
    >
      <p className="flex items-baseline gap-2">
        <span className="text-display font-semibold tracking-tight text-ink">{streak}</span>
        <span className="text-lg text-ink-2">{streak === 1 ? "day" : "days"}</span>
      </p>

      <ol className="mt-auto grid grid-cols-7 gap-1 pt-5" aria-label="Last seven days">
        {week.map((day, i) => {
          const date = parseDay(day.date);
          const active = total(day) > 0;
          return (
            <li key={day.date} className="flex flex-col items-center gap-1.5" title={describe(day)}>
              <span className="text-xs text-ink-2" aria-hidden="true">
                {date.toLocaleDateString("en", { weekday: "narrow" })}
              </span>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-xs font-medium",
                  active ? "bg-clay-strong text-on-accent" : "bg-stone-100 text-ink-2",
                  i === week.length - 1 && "ring-2 ring-clay ring-offset-2 ring-offset-paper",
                )}
              >
                {date.getDate()}
              </span>
              <span className="sr-only">{describe(day)}</span>
            </li>
          );
        })}
      </ol>

      <dl className="mt-5 grid grid-cols-2 border-t border-stone pt-4 text-sm">
        <div>
          <dt className="text-ink-2">Best streak</dt>
          <dd className="font-semibold text-ink">{plural(longest, "day")}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Study days</dt>
          <dd className="font-semibold text-ink">{insights.active_days}</dd>
        </div>
      </dl>
    </DashCard>
  );
}

/** Month name above the first week column of each month, skipped when it would collide with the previous one. */
function monthLabels(columns: (DayActivity | null)[][]): string[] {
  let lastAt = -3;
  return columns.map((week, col) => {
    const first = week.find((c): c is DayActivity => c !== null);
    if (!first) return "";
    const date = parseDay(first.date);
    const prev = col > 0 ? columns[col - 1].find((c): c is DayActivity => c !== null) : null;
    const newMonth = !prev || parseDay(prev.date).getMonth() !== date.getMonth();
    // The first column is often the tail of a month; label it only if the next month is far enough away
    const startsLate = col === 0 && date.getDate() > 21;
    if (!newMonth || startsLate || col - lastAt < 3) return "";
    lastAt = col;
    return date.toLocaleDateString("en", { month: "short" });
  });
}

/** Half a year of questions and quizzes, one square per day, Monday at the top. Squares grow with the card. */
export function ActivityCard({ insights }: { insights: StudyInsights }) {
  const days = insights.activity;
  const pad = mondayIndex(parseDay(days[0].date));
  const cells: (DayActivity | null)[] = [...Array<null>(pad).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const columns = Array.from({ length: cells.length / 7 }, (_, c) => cells.slice(c * 7, c * 7 + 7));
  const labels = monthLabels(columns);
  const weeks = Math.round(days.length / 7);

  const questions = days.reduce((sum, d) => sum + d.questions, 0);
  const quizzes = days.reduce((sum, d) => sum + d.quizzes, 0);
  const activeDays = days.filter((d) => total(d) > 0).length;
  const stats = [
    { label: "Questions", value: questions },
    { label: "Quizzes", value: quizzes },
    { label: "Active days", value: activeDays },
  ];
  const grid = { gridTemplateColumns: `28px repeat(${columns.length}, minmax(0, 1fr))` };

  return (
    <DashCard title="Activity" icon={CalendarDays} action={<span className="text-ink-2">Last {weeks} weeks</span>}>
      <dl className="mb-5 grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-small text-ink-2">{s.label}</dt>
            <dd className="text-page font-semibold tracking-tight text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>

      <figure className="mt-auto">
        <div className="grid gap-[3px] text-xs text-ink-2" style={grid} aria-hidden="true">
          <span />
          {labels.map((label, i) => (
            <span key={i} className="h-4 overflow-visible whitespace-nowrap leading-4">
              {label}
            </span>
          ))}
        </div>
        <div
          className="mt-1 grid grid-flow-col grid-rows-7 gap-[3px]"
          style={grid}
          role="img"
          aria-label={`Activity over the last ${weeks} weeks: ${plural(questions, "question")} and ${quizzes} ${quizzes === 1 ? "quiz" : "quizzes"} on ${plural(activeDays, "day")}`}
        >
          {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
            <span key={`label-${i}`} className="flex items-center text-xs leading-none text-ink-2" style={{ gridColumn: 1, gridRow: i + 1 }} aria-hidden="true">
              {d}
            </span>
          ))}
          {cells.map((cell, i) => (
            <span
              key={cell?.date ?? `pad-${i}`}
              title={cell ? describe(cell) : undefined}
              style={{ gridColumn: Math.floor(i / 7) + 2, gridRow: (i % 7) + 1 }}
              className={cn(
                "aspect-square w-full max-w-7 rounded-[3px]",
                cell ? LEVELS[activityLevel(total(cell))] : "invisible",
                cell?.date === insights.today && "ring-1 ring-ink ring-offset-1 ring-offset-paper",
              )}
            />
          ))}
        </div>
        <figcaption className="mt-3 flex items-center justify-end gap-1.5 text-xs text-ink-2">
          Less
          {LEVELS.map((level) => (
            <span key={level} className={cn("size-2.5 rounded-[2px]", level)} aria-hidden="true" />
          ))}
          More
        </figcaption>
      </figure>
    </DashCard>
  );
}
