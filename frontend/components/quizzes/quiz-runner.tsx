"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ApiError } from "@/lib/api-client";
import { quizzesApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { QuizDetail } from "@/types/api";

type Props = { quiz: QuizDetail; onSubmitted: () => void };

/** One question per view. Options are a radio group: arrow keys move, keys 1 to 4 select, Enter goes next.
 *  Answers are never revealed before submission, and submitting is protected against double clicks. */
export function QuizRunner({ quiz, onSubmitted }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = quiz.questions.length;
  const question = quiz.questions[index];
  const last = index === total - 1;
  const selected = answers[question.id];
  const complete = Object.keys(answers).length === total;

  async function submit() {
    if (!complete || pending) return;
    setPending(true);
    setError(null);
    try {
      await quizzesApi.submit(
        quiz.id,
        quiz.questions.map((q) => ({ question_id: q.id, selected_index: answers[q.id] })),
      );
      onSubmitted();
    } catch (e) {
      if (e instanceof ApiError && e.code === "already_submitted") {
        onSubmitted(); // submitted from another tab: just show the saved result
        return;
      }
      setError(e instanceof ApiError ? e.message : "Could not submit your answers. Please try again.");
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (selected === undefined || pending) return;
    if (last) void submit();
    else setIndex(index + 1);
  }

  function onKeyDown(event: KeyboardEvent) {
    const n = Number(event.key);
    if (Number.isInteger(n) && n >= 1 && n <= question.options.length && !pending) {
      setAnswers({ ...answers, [question.id]: n - 1 });
    }
  }

  return (
    <PageContainer>
      <PageHeader title={quiz.title} description={`${quiz.question_count} questions · ${quiz.source_documents.join(", ") || "Your material"}`} />
      <form onSubmit={onSubmit} onKeyDown={onKeyDown} className="flex max-w-3xl flex-col gap-6">
        <ProgressBar value={((index + 1) / total) * 100} label={`Question ${index + 1} of ${total}`} className="[&>span]:hidden" />
        <fieldset key={question.id} className="rounded-panel border border-stone bg-paper p-6">
          <legend className="px-1 text-small text-ink-2">
            Question {index + 1} of {total}
          </legend>
          <p className="mb-4 text-base font-medium text-ink">{question.question_text}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((option, optionIndex) => {
              const checked = selected === optionIndex;
              return (
                <label
                  key={optionIndex}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 rounded-control border px-4 py-3 text-sm transition-colors duration-[120ms] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-clay",
                    checked ? "border-clay bg-clay-soft text-accent-ink" : "border-stone bg-paper text-ink hover:bg-stone-100",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={checked}
                    onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })}
                    disabled={pending}
                    className="mt-0.5 accent-clay-strong"
                  />
                  {/* The number comes from CSS so it is not part of the radio's accessible name */}
                  <span data-n={optionIndex + 1} className="before:mr-2 before:text-ink-2 before:content-[attr(data-n)]">
                    {option}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <Button variant="secondary" onClick={() => setIndex(index - 1)} disabled={index === 0 || pending}>
            Back
          </Button>
          <div className="flex items-center gap-4">
            <p className="text-small text-ink-2" aria-live="polite">
              {Object.keys(answers).length} of {total} answered
            </p>
            {last ? (
              <Button type="submit" disabled={!complete} loading={pending}>
                {pending ? "Submitting" : "Submit quiz"}
              </Button>
            ) : (
              <Button type="submit" disabled={selected === undefined}>
                Next
              </Button>
            )}
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
