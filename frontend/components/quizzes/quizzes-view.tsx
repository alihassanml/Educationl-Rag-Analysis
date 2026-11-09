"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { documentsApi, quizzesApi } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { useApi } from "@/lib/use-api";
import { GeneratePanel } from "./generate-panel";

export function QuizzesView() {
  const docs = useApi(documentsApi.list);
  const quizzes = useApi(quizzesApi.list);
  const ready = docs.data?.items.filter((d) => d.status === "ready") ?? [];

  return (
    <PageContainer>
      <PageHeader title="Practice Quizzes" description="Multiple-choice questions written from your own material." />
      <div className="flex flex-col gap-8">
        {docs.loading ? <LoadingBlock label="Loading" /> : null}
        {docs.error ? <ErrorBlock message={docs.error.message} onRetry={docs.reload} /> : null}
        {docs.data && ready.length === 0 ? (
          <EmptyState
            title="Upload a document to create quizzes"
            action={
              <Link href="/library" className="font-medium text-primary underline-offset-4 hover:underline">
                Go to My Library
              </Link>
            }
          >
            Quizzes are generated from your processed PDFs.
          </EmptyState>
        ) : null}
        {ready.length > 0 ? <GeneratePanel documents={ready} /> : null}

        <section aria-labelledby="quiz-history">
          <h2 id="quiz-history" className="mb-3 text-lg font-semibold">
            Your quizzes
          </h2>
          {quizzes.loading ? <LoadingBlock label="Loading your quizzes" /> : null}
          {quizzes.error ? <ErrorBlock message={quizzes.error.message} onRetry={quizzes.reload} /> : null}
          {quizzes.data && quizzes.data.items.length === 0 ? (
            <p className="text-muted">No quizzes yet. Create your first one above.</p>
          ) : null}
          {quizzes.data && quizzes.data.items.length > 0 ? (
            <ul className="divide-y divide-border rounded-panel border border-border bg-surface">
              {quizzes.data.items.map((quiz) => (
                <li key={quiz.id}>
                  <Link
                    href={`/quizzes/${quiz.id}`}
                    className="flex flex-col gap-1 p-4 hover:bg-selected sm:flex-row sm:items-center sm:justify-between sm:p-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{quiz.title}</span>
                      <span className="block text-sm text-muted">
                        {quiz.question_count} questions · {quiz.source_documents.join(", ") || "Source removed"} ·{" "}
                        {formatDate(quiz.created_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium">
                      {quiz.attempt ? `${quiz.attempt.score} of ${quiz.attempt.total_questions} correct` : "Not taken yet"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </PageContainer>
  );
}
