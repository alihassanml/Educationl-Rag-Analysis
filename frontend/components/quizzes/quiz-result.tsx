import { CheckCircle2, XCircle } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
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
          <p className="text-3xl font-semibold">
            {result.score} of {result.total_questions} correct
            <span className="ml-3 text-lg font-normal text-muted">{result.percent}%</span>
          </p>
          {result.recommendation ? (
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium">Suggested next step</p>
                {result.topic_status ? <TopicStatusLabel status={result.topic_status} /> : null}
              </div>
              <p className="mt-1">{result.recommendation.message}</p>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/quizzes">
              {result.topic_status === "doing_well" ? "Try a harder quiz" : "Try another quiz"}
            </ButtonLink>
            {needsReview ? (
              <ButtonLink variant="secondary" href={`/tutor?q=${encodeURIComponent(`Explain ${result.topic} in simple words`)}`}>
                Review this topic
              </ButtonLink>
            ) : null}
            <ButtonLink variant="secondary" href="/progress">
              View progress
            </ButtonLink>
          </div>
        </Panel>

        <ol className="flex flex-col gap-4">
          {result.results.map((r, index) => (
            <li key={r.question_id} className="rounded-panel border border-border bg-surface p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                {r.is_correct ? (
                  <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
                ) : (
                  <XCircle size={18} className="text-danger" aria-hidden="true" />
                )}
                <span className={r.is_correct ? "text-success" : "text-danger"}>
                  Question {index + 1}: {r.is_correct ? "Correct" : "Incorrect"}
                </span>
              </p>
              <p className="mt-2 font-medium">{r.question_text}</p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted">Your answer:</dt>
                  <dd>{r.options[r.selected_index]}</dd>
                </div>
                {!r.is_correct ? (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted">Correct answer:</dt>
                    <dd className="font-medium">{r.options[r.correct_index]}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 text-sm">{r.explanation}</p>
              {r.sources.length > 0 ? (
                <p className="mt-2 text-sm text-muted">
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
