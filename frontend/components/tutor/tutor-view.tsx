"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from "@/components/ui/feedback";
import { ApiError } from "@/lib/api-client";
import { documentsApi, tutorApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { AskResponse } from "@/types/api";
import { AnswerCard } from "./answer-card";
import { ScopeSelector } from "./scope-selector";

type Turn = {
  id: number;
  question: string;
  documentIds: string[];
  response?: AskResponse;
  error?: string;
  pending: boolean;
};

const EXAMPLES = [
  "Summarise the main ideas in my notes",
  "What are the key definitions I should remember?",
  "Explain the most difficult concept in simple words",
];

export function TutorView() {
  const docs = useApi(documentsApi.list);
  const initial = useSearchParams().get("q") ?? "";
  const [question, setQuestion] = useState(initial);
  const [scope, setScope] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const busy = turns.some((t) => t.pending);

  const ready = docs.data?.items.filter((d) => d.status === "ready") ?? [];

  async function run(id: number, text: string, documentIds: string[]) {
    try {
      const response = await tutorApi.ask(text, documentIds);
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, response, error: undefined, pending: false } : t)));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, error: message, pending: false } : t)));
    }
  }

  function ask(text: string) {
    const id = nextId.current++;
    setTurns((all) => [...all, { id, question: text, documentIds: scope, pending: true }]);
    void run(id, text, scope);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setQuestion("");
    ask(text);
  }

  function retry(turn: Turn) {
    setTurns((all) => all.map((t) => (t.id === turn.id ? { ...t, pending: true, error: undefined } : t)));
    void run(turn.id, turn.question, turn.documentIds);
  }

  return (
    <PageContainer>
      <PageHeader title="Study Tutor" description="Ask a question and get an answer based on your own uploaded material." />
      <div className="flex max-w-3xl flex-col gap-6">
        {docs.loading ? <LoadingBlock label="Loading your documents" /> : null}
        {docs.error ? <ErrorBlock message={docs.error.message} onRetry={docs.reload} /> : null}

        {docs.data && ready.length === 0 ? (
          <EmptyState
            title="Upload a document first"
            action={
              <Link href="/library" className="font-medium text-primary underline-offset-4 hover:underline">
                Go to My Library
              </Link>
            }
          >
            The tutor answers from your own material, so it needs at least one processed PDF.
          </EmptyState>
        ) : null}

        {ready.length > 0 ? (
          <>
            <ScopeSelector documents={ready} selected={scope} onChange={setScope} disabled={busy} />

            {turns.length === 0 ? (
              <div>
                <p className="mb-3 text-sm font-medium">Try asking</p>
                <div className="flex flex-col gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setQuestion(example)}
                      className="rounded-control border border-border bg-surface px-4 py-2.5 text-left text-sm hover:bg-selected"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="flex flex-col gap-8" aria-live="polite">
                {turns.map((turn) => (
                  <li key={turn.id} className="flex flex-col gap-3">
                    <p className="self-end rounded-panel bg-selected px-4 py-2.5 text-foreground">{turn.question}</p>
                    {turn.pending ? (
                      <p role="status" className="flex items-center gap-2 text-muted">
                        <Spinner /> Searching your material
                      </p>
                    ) : null}
                    {turn.error ? <ErrorBlock message={turn.error} onRetry={() => retry(turn)} /> : null}
                    {turn.response ? <AnswerCard response={turn.response} /> : null}
                  </li>
                ))}
              </ol>
            )}

            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <label htmlFor="question" className="text-sm font-medium">
                Your question
              </label>
              <Textarea
                id="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="For example: What is the difference between a stack and a queue?"
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={busy || question.trim().length < 3}>
                  {busy ? <Spinner /> : <Send size={16} aria-hidden="true" />}
                  {busy ? "Searching" : "Ask your tutor"}
                </Button>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
