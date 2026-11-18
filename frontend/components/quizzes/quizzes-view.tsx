"use client";

import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { documentsApi, quizzesApi } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { useApi } from "@/lib/use-api";
import { GeneratePanel } from "./generate-panel";

export function QuizzesView() {
  const docs = useApi(documentsApi.list);
  const quizzes = useApi(quizzesApi.list);
  const prefill = useSearchParams().get("topic") ?? "";
  const [open, setOpen] = useState(prefill !== "");
  const ready = docs.data?.items.filter((d) => d.status === "ready") ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Quizzes"
        description="Multiple-choice questions written from your own material"
        action={
          ready.length > 0 ? (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              New quiz
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6">
        {docs.loading ? <LoadingBlock label="Loading" /> : null}
        {docs.error ? <ErrorBlock message={docs.error.message} onRetry={docs.reload} /> : null}
        {docs.data && ready.length === 0 ? (
          <EmptyState title="Upload a document to create quizzes" icon={ClipboardList} action={<ButtonLink href="/library">Go to My library</ButtonLink>}>
            Quizzes are generated from your processed PDFs
          </EmptyState>
        ) : null}

        {ready.length > 0 ? (
          <section aria-labelledby="quiz-history">
            <h2 id="quiz-history" className="mb-3 text-lg font-semibold text-ink">
              Your quizzes
            </h2>
            {quizzes.loading ? <LoadingBlock label="Loading your quizzes" /> : null}
            {quizzes.error ? <ErrorBlock message={quizzes.error.message} onRetry={quizzes.reload} /> : null}
            {quizzes.data && quizzes.data.items.length === 0 ? (
              <EmptyState title="No quizzes yet" icon={ClipboardList} action={<Button onClick={() => setOpen(true)}>New quiz</Button>}>
                Your quizzes and their scores will be listed here
              </EmptyState>
            ) : null}
            {quizzes.data && quizzes.data.items.length > 0 ? (
              <ul className="divide-y divide-stone overflow-hidden rounded-panel border border-stone bg-paper">
                {quizzes.data.items.map((quiz) => (
                  <li key={quiz.id}>
                    <Link href={`/quizzes/${quiz.id}`} className="flex flex-col gap-2 p-4 hover:bg-stone-100 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{quiz.topic ?? quiz.title}</span>
                        <span className="block text-small text-ink-2">
                          {quiz.question_count} questions · {quiz.source_documents.join(", ") || "Source removed"} · {formatDate(quiz.created_at)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <Chip className="capitalize">{quiz.difficulty}</Chip>
                        <span className="w-24 text-right text-sm font-medium text-ink">{quiz.attempt ? `${quiz.attempt.score} of ${quiz.attempt.total_questions} correct` : "Not taken yet"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>

      <Dialog open={open} title="New quiz" onClose={() => setOpen(false)}>
        {ready.length > 0 ? <GeneratePanel documents={ready} initialTopic={prefill} onCancel={() => setOpen(false)} onCreated={() => setOpen(false)} /> : null}
      </Dialog>
    </PageContainer>
  );
}
