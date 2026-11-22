"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { LevelChip } from "@/components/quizzes/level-change";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TopicStatusLabel } from "@/components/ui/status-label";
import { cn } from "@/lib/cn";
import { pagesLabel } from "@/lib/formatters";
import type { PathStep } from "@/types/api";

/** One step of the stepper: number and connector, then the topic with its status, level, accuracy,
 *  what to do next, and the three ways to act (Study, Quiz, Source). */
export function StepCard({ step, last }: { step: PathStep; last: boolean }) {
  const [showSources, setShowSources] = useState(false);
  const sourcesId = useId();
  const encoded = encodeURIComponent(step.name);
  return (
    <li className="flex gap-4" aria-current={step.is_current ? "step" : undefined}>
      <div className="flex flex-col items-center" aria-hidden="true">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
            step.is_current ? "border-clay-strong bg-clay-strong text-on-accent" : "border-stone-strong bg-paper text-ink",
          )}
        >
          {step.position}
        </span>
        {last ? null : <span className="mt-1 w-px flex-1 bg-stone-strong" />}
      </div>

      <section aria-label={`Step ${step.position}: ${step.name}`} className={cn("mb-1 min-w-0 flex-1 rounded-panel border bg-paper p-4", step.is_current ? "border-clay" : "border-stone")}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto min-w-0 truncate text-base font-semibold text-ink">{step.name}</h3>
          {step.is_current ? <Chip tone="clay">Current step</Chip> : null}
          <TopicStatusLabel status={step.status} />
          {step.level ? <LevelChip level={step.level} /> : null}
        </div>

        {step.accuracy_percent !== null ? (
          <div className="mt-3">
            <ProgressBar value={step.accuracy_percent} label={`${step.name} accuracy`} />
            <p className="mt-1 text-small text-ink-2">{step.questions_attempted} questions answered</p>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-ink">{step.next_action.message}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {step.light_episode_id ? (
            <ButtonLink size="sm" href={`/light-mode/${step.light_episode_id}`}>
              Lighter step
            </ButtonLink>
          ) : null}
          <ButtonLink size="sm" variant={step.light_episode_id ? "secondary" : "primary"} href={`/tutor?q=${encodeURIComponent(`Explain ${step.name}`)}`}>
            Study
          </ButtonLink>
          <ButtonLink size="sm" variant="secondary" href={`/tutor?mode=quiz&q=${encoded}`}>
            Quiz
          </ButtonLink>
          <button
            type="button"
            aria-expanded={showSources}
            aria-controls={sourcesId}
            onClick={() => setShowSources((v) => !v)}
            className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-sm text-ink-2 hover:bg-stone-100 hover:text-ink"
          >
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" className={cn("transition-transform duration-[120ms]", showSources && "rotate-90")} />
            Source
          </button>
        </div>
        {showSources ? (
          <ul id={sourcesId} aria-label={`Sources for ${step.name}`} className="mt-2 flex flex-col gap-1 text-small text-ink-2">
            {step.sources.map((s) => {
              const pages = pagesLabel(s.first_page, s.last_page);
              return (
                <li key={s.document_id}>
                  <span className="font-medium text-ink">{s.document_title}</span>
                  {pages ? `, ${pages}` : ""}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </li>
  );
}
