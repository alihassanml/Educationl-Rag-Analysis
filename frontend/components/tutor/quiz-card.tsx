"use client";

import { CheckCircle2, ExternalLink, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DownloadNotesButton } from "@/components/quizzes/download-notes-button";
import { LevelChangeNote, nextQuizLabel } from "@/components/quizzes/level-change";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TopicStatusLabel } from "@/components/ui/status-label";
import { ApiError } from "@/lib/api-client";
import { quizzesApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { sourceLabel } from "@/lib/formatters";
import type { QuizRequest } from "@/lib/quiz-request";
import type { AttemptResult, QuizDetail } from "@/types/api";

type State =
  | { step: "writing" }
  | { step: "failed"; message: string }
  | { step: "answering"; quiz: QuizDetail }
  | { step: "done"; quiz: QuizDetail; result: AttemptResult };

type Props = {
  request: QuizRequest;
  documentIds: string[];
  /** Start another quiz on the same request. */
  onAgain: () => void;
  /** Start the next quiz on a topic. It is made at the level the topic is now at. */
  onNext?: (topic: string) => void;
  /** The saved quiz's id, so a follow-up ("10 more") can avoid repeating its questions */
  onCreated?: (quizId: string) => void;
};

/** A real quiz, inside the conversation. It is created, answered and scored by the same quiz service
 *  as the Quizzes pages, so results, study notes and progress all still count. */
export function QuizCard({ request, documentIds, onAgain, onNext, onCreated }: Props) {
  const [state, setState] = useState<State>({ step: "writing" });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // strict mode runs effects twice; one quiz is enough
    started.current = true;
    quizzesApi
      .generate({
        topic: request.topic ?? undefined,
        document_ids: documentIds.length > 0 ? documentIds : undefined,
        // No level unless the student chose one: the server uses the topic's current level
        ...(request.difficulty ? { difficulty: request.difficulty } : {}),
        num_questions: request.count,
        ...(request.excludeQuizId ? { exclude_quiz_id: request.excludeQuizId } : {}),
      })
      .then((quiz) => {
        onCreated?.(quiz.id);
        setState({ step: "answering", quiz });
      })
      .catch((e) => setState({ step: "failed", message: e instanceof ApiError ? e.message : "The quiz could not be written. Please try again." }));
  }, [request, documentIds, onCreated]);

  async function submit(quiz: QuizDetail) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await quizzesApi.submit(
        quiz.id,
        quiz.questions.map((q) => ({ question_id: q.id, selected_index: answers[q.id] })),
      );
      setState({ step: "done", quiz, result });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit your answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const heading = request.topic ? `Quiz on ${request.topic}` : "Quiz on your material";

  if (state.step === "writing") {
    return (
      <div role="status" aria-label="Writing your quiz" className="max-w-[720px] rounded-panel border border-stone p-5">
        <p className="text-sm font-medium text-ink">Writing {request.count} questions{request.topic ? ` on ${request.topic}` : " from your material"}</p>
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (state.step === "failed") {
    return (
      <div role="alert" className="max-w-[720px] rounded-panel border border-stone p-5">
        <p className="font-medium text-ink">The quiz could not be created</p>
        <p className="mt-1 text-ink-2">{state.message}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onAgain}>
          Try again
        </Button>
      </div>
    );
  }

  if (state.step === "answering") {
    const { quiz } = state;
    const answered = Object.keys(answers).length;
    const complete = answered === quiz.questions.length;
    return (
      <section aria-label={heading} className="max-w-[720px] rounded-panel border border-stone p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-base font-semibold text-ink">{quiz.title || heading}</h3>
          <p className="shrink-0 text-small text-ink-2">
            {answered} of {quiz.questions.length} answered
          </p>
        </div>
        <ol className="mt-4 flex flex-col gap-6">
          {quiz.questions.map((q, index) => (
            <li key={q.id}>
              <fieldset disabled={submitting}>
                <legend className="text-base font-medium text-ink">
                  <span className="mr-2 text-ink-2">{index + 1}.</span>
                  {q.question_text}
                </legend>
                <div className="mt-2 flex flex-col gap-1.5">
                  {q.options.map((option, i) => {
                    const checked = answers[q.id] === i;
                    return (
                      <label
                        key={i}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors duration-[120ms]",
                          checked ? "border-clay bg-clay-soft text-accent-ink" : "border-stone text-ink hover:bg-stone-100",
                        )}
                      >
                        <input type="radio" name={`${quiz.id}-${q.id}`} className="mt-0.5 accent-clay-strong" checked={checked} onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))} />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{option}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void submit(quiz)} disabled={!complete} loading={submitting}>
            Submit answers
          </Button>
          {!complete ? <p className="text-small text-ink-2">Answer every question to submit</p> : null}
        </div>
      </section>
    );
  }

  const { result, quiz } = state;
  return (
    <section aria-label="Quiz result" className="max-w-[720px] rounded-panel border border-stone p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{result.quiz_title}</h3>
        {result.topic_status ? <TopicStatusLabel status={result.topic_status} /> : null}
      </div>
      <p className="mt-2 text-metric font-semibold tracking-tight text-ink">
        {result.score} of {result.total_questions} correct <span className="text-base font-normal text-ink-2">({result.percent}%)</span>
      </p>
      {result.recommendation ? <p className="mt-1 text-ink">{result.recommendation.message}</p> : null}
      <LevelChangeNote result={result} />

      <ol className="mt-5 divide-y divide-stone border-y border-stone">
        {result.results.map((r, index) => (
          <li key={r.question_id} className="py-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-small text-ink-2">Question {index + 1}</p>
              <p className={cn("inline-flex items-center gap-1 text-sm font-medium", r.is_correct ? "text-success" : "text-danger")}>
                {r.is_correct ? <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" /> : <XCircle size={16} strokeWidth={1.75} aria-hidden="true" />}
                {r.is_correct ? "Correct" : "Incorrect"}
              </p>
            </div>
            <p className="mt-1 font-medium text-ink">{r.question_text}</p>
            <p className="mt-2 text-sm text-ink-2">
              Your answer: <span className="text-ink">{r.options[r.selected_index]}</span>
            </p>
            {!r.is_correct ? (
              <p className="text-sm text-ink-2">
                Correct answer: <span className="font-medium text-ink">{r.options[r.correct_index]}</span>
              </p>
            ) : null}
            <p className="mt-2 text-sm text-ink">{r.explanation}</p>
            {r.sources.length > 0 ? <p className="mt-1 text-small text-ink-2">Source: {r.sources.map(sourceLabel).join("; ")}</p> : null}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {result.topic && result.next_difficulty && onNext ? (
          <Button size="sm" onClick={() => onNext(result.topic as string)}>
            {nextQuizLabel(result.level_change)}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={onAgain}>
          <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
          Quiz me again
        </Button>
        <DownloadNotesButton quizId={quiz.id} />
        <Link href={`/quizzes/${quiz.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-2 hover:bg-stone-100 hover:text-ink">
          <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          Open full page
        </Link>
      </div>
    </section>
  );
}
