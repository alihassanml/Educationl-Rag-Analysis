import { CheckCircle2, XCircle } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { TopicStatusLabel } from "@/components/ui/status-label";
import { pageLabel } from "@/lib/formatters";
import type { AttemptResult } from "@/types/api";

export function QuizResult({ result }: { result: AttemptResult }) {
  const needsReview = result.topic_status === "needs_revision" && result.topic;
  return (
    <PageContainer>
      <PageHeader title={result.quiz_title} description="Your result" />
      <div className="flex max-w-3xl flex-col gap-6">
        <Panel>
          <p className="text-metric font-medium text-ink">
            {result.score} / {result.total_questions}
          </p>
          <p className="mt-1 text-ink-2">
            {result.score} of {result.total_questions} correct ({result.percent}%)
          </p>
          {result.recommendation ? (
            <div className="mt-4 border-t border-stone pt-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-ink">Suggested next step</p>
                {result.topic_status ? <TopicStatusLabel status={result.topic_status} /> : null}
              </div>
              <p className="mt-1 text-ink">{result.recommendation.message}</p>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            {needsReview ? (
              <ButtonLink href={`/tutor?q=${encodeURIComponent(`Explain ${result.topic} in simple words`)}`}>Review this topic</ButtonLink>
            ) : (
              <ButtonLink href="/quizzes">{result.topic_status === "doing_well" ? "Try a harder quiz" : "Try another quiz"}</ButtonLink>
            )}
            {needsReview ? (
              <ButtonLink variant="secondary" href="/quizzes">
                Try another quiz
              </ButtonLink>
            ) : null}
            <ButtonLink variant="ghost" href="/progress">
              View progress
            </ButtonLink>
          </div>
        </Panel>

        <ol className="flex flex-col gap-4">
          {result.results.map((r, index) => (
            <li key={r.question_id} className="rounded-panel border border-stone bg-paper p-6">
              <div className="flex items-center gap-2">
                <Chip tone={r.is_correct ? "success" : "danger"} icon={r.is_correct ? CheckCircle2 : XCircle}>
                  Question {index + 1}: {r.is_correct ? "Correct" : "Incorrect"}
                </Chip>
              </div>
              <p className="mt-3 text-base font-medium text-ink">{r.question_text}</p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-2">Your answer:</dt>
                  <dd className="text-ink">{r.options[r.selected_index]}</dd>
                </div>
                {!r.is_correct ? (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-ink-2">Correct answer:</dt>
                    <dd className="font-medium text-ink">{r.options[r.correct_index]}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 text-sm text-ink">{r.explanation}</p>
              {r.sources.length > 0 ? (
                <p className="mt-2 inline-block rounded-md bg-clay-soft px-2 py-1 text-small text-clay-stronger">
                  Source: {r.sources.map((s) => `${s.document_title}, ${pageLabel(s.page_number)}`).join("; ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </PageContainer>
  );
}
