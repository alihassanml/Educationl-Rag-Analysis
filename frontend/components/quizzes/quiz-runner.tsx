"use client";

import { useState, type FormEvent } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { ApiError } from "@/lib/api-client";
import { quizzesApi } from "@/lib/api";
import type { QuizDetail } from "@/types/api";

type Props = { quiz: QuizDetail; onSubmitted: () => void };

export function QuizRunner({ quiz, onSubmitted }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = Object.keys(answers).length;
  const complete = answered === quiz.questions.length;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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

  return (
    <PageContainer>
      <PageHeader
        title={quiz.title}
        description={`${quiz.question_count} questions · ${quiz.source_documents.join(", ") || "Your material"}`}
      />
      <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-6">
        {quiz.questions.map((q, index) => (
          <fieldset key={q.id} className="rounded-panel border border-border bg-surface p-5">
            <legend className="px-1 text-sm text-muted">
              Question {index + 1} of {quiz.questions.length}
            </legend>
            <p className="mb-4 font-medium">{q.question_text}</p>
            <div className="flex flex-col gap-2">
              {q.options.map((option, optionIndex) => {
                const checked = answers[q.id] === optionIndex;
                return (
                  <label
                    key={optionIndex}
                    className={`flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 text-sm ${
                      checked ? "border-primary bg-selected" : "border-border hover:bg-background"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={checked}
                      onChange={() => setAnswers({ ...answers, [q.id]: optionIndex })}
                      disabled={pending}
                      className="mt-1 accent-primary"
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted" aria-live="polite">
            {answered} of {quiz.questions.length} answered
          </p>
          <Button type="submit" disabled={!complete || pending}>
            {pending ? <Spinner /> : null}
            {pending ? "Submitting" : "Submit answers"}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
