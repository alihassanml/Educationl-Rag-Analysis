"use client";

import { useParams } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { quizzesApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { QuizResult } from "./quiz-result";
import { QuizRunner } from "./quiz-runner";

function SavedResult({ quizId }: { quizId: string }) {
  const result = useApi((signal) => quizzesApi.result(quizId, signal));
  if (result.error) {
    return (
      <PageContainer>
        <ErrorBlock message={result.error.message} onRetry={result.reload} />
      </PageContainer>
    );
  }
  if (!result.data) {
    return (
      <PageContainer>
        <LoadingBlock label="Loading your result" />
      </PageContainer>
    );
  }
  return <QuizResult result={result.data} />;
}

export function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const quiz = useApi((signal) => quizzesApi.get(quizId, signal));

  if (quiz.error && !quiz.data) {
    return (
      <PageContainer>
        <ErrorBlock
          message={quiz.error.status === 404 ? "This quiz could not be found." : quiz.error.message}
          onRetry={quiz.reload}
        />
      </PageContainer>
    );
  }
  if (!quiz.data) {
    return (
      <PageContainer>
        <LoadingBlock label="Loading quiz" />
      </PageContainer>
    );
  }
  // After a submission the quiz is re-fetched; its saved attempt then switches the view to results
  if (quiz.data.attempt) return <SavedResult quizId={quizId} />;
  return <QuizRunner quiz={quiz.data} onSubmitted={quiz.reload} />;
}
