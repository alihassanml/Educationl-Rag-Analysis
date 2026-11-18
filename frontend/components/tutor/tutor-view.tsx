"use client";

import { FileSearch } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { documentsApi, tutorApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { AskResponse, StudyDocument } from "@/types/api";
import { AnswerCard } from "./answer-card";
import { Composer } from "./composer";
import { SourcesList, SourcesPanel } from "./sources-panel";
import { uniqueSources, type Source } from "./sources";

type Turn = {
  id: number;
  question: string;
  documentIds: string[];
  response?: AskResponse;
  error?: string;
  pending: boolean;
};

const SUGGESTIONS = [
  (title: string) => `Summarise the key ideas in ${title}`,
  (title: string) => `Explain the hardest topic in ${title} simply`,
  (title: string) => `List the key definitions in ${title}`,
  (title: string) => `What should I remember from ${title} for an exam?`,
];

/** Four prompt cards built from the student's real document titles. Clicking one fills the composer; it never sends. */
export function suggestionsFor(documents: StudyDocument[]): string[] {
  if (documents.length === 0) return [];
  return SUGGESTIONS.map((make, i) => make(documents[i % documents.length].title));
}

export function TutorView() {
  const docs = useApi(documentsApi.list);
  const params = useSearchParams();
  const docParam = params.get("doc");
  const [question, setQuestion] = useState(params.get("q") ?? "");
  const [scope, setScope] = useState<string[]>(docParam ? [docParam] : []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const nextId = useRef(1);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const busy = turns.some((t) => t.pending);

  const ready = docs.data?.items.filter((d) => d.status === "ready") ?? [];
  const activeSources: Source[] = uniqueSources(turns.find((t) => t.id === activeTurn)?.response?.citations ?? []);

  async function run(id: number, text: string, documentIds: string[]) {
    try {
      const response = await tutorApi.ask(text, documentIds);
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, response, error: undefined, pending: false } : t)));
      if (!response.insufficient_evidence && response.citations.length > 0) {
        setActiveTurn(id);
        setActiveMarker(null);
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, error: message, pending: false } : t)));
      setQuestion((current) => (current === "" ? text : current)); // keep the question in the composer
    }
  }

  function ask() {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    const id = nextId.current++;
    setQuestion("");
    setTurns((all) => [...all, { id, question: text, documentIds: scope, pending: true }]);
    void run(id, text, scope);
  }

  function retry(turn: Turn) {
    setTurns((all) => all.map((t) => (t.id === turn.id ? { ...t, pending: true, error: undefined } : t)));
    void run(turn.id, turn.question, turn.documentIds);
  }

  function openSource(turn: Turn, source: Source) {
    setActiveTurn(turn.id);
    setActiveMarker(source.marker);
    // Below 1280px the sources open as a sheet; at 1280px and up the side panel is already visible
    if (!window.matchMedia("(min-width: 1280px)").matches) setSheetOpen(true);
  }

  const rephrase = () => composerRef.current?.focus();
  const suggestions = suggestionsFor(ready);

  return (
    <PageContainer>
      <PageHeader title="Study tutor" description="Ask a question and get an answer based on your own uploaded material" />
      {docs.loading ? <LoadingBlock label="Loading your documents" /> : null}
      {docs.error ? <ErrorBlock message={docs.error.message} onRetry={docs.reload} /> : null}

      {docs.data && ready.length === 0 ? (
        <EmptyState title="Upload a document first" icon={FileSearch} action={<ButtonLink href="/library">Go to My library</ButtonLink>}>
          The tutor answers from your own material, so it needs at least one processed PDF
        </EmptyState>
      ) : null}

      {ready.length > 0 ? (
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 xl:max-w-none">
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
              {turns.length === 0 ? (
                <section aria-labelledby="empty-title" className="py-6">
                  <h2 id="empty-title" className="text-lg font-semibold text-ink">
                    Ask about your material
                  </h2>
                  <p className="mt-1 text-ink-2">Pick a suggestion to start, or write your own question below</p>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {suggestions.map((text) => (
                      <li key={text}>
                        <button
                          type="button"
                          onClick={() => {
                            setQuestion(text);
                            composerRef.current?.focus();
                          }}
                          className="h-full w-full rounded-panel border border-stone-strong bg-paper p-4 text-left text-sm text-ink hover:bg-stone-100"
                        >
                          {text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <ol className="flex flex-col gap-10" aria-live="polite">
                  {turns.map((turn) => (
                    <li key={turn.id} className="flex flex-col gap-4">
                      <p className="max-w-[85%] self-end rounded-panel bg-stone-100 px-4 py-2.5 text-ink">{turn.question}</p>
                      {turn.pending ? (
                        <div role="status" className="flex flex-col gap-2">
                          <p className="text-ink-2">Searching your material and writing an answer</p>
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-11/12" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      ) : null}
                      {turn.error ? <ErrorBlock message={turn.error} onRetry={() => retry(turn)} /> : null}
                      {turn.response ? <AnswerCard response={turn.response} onRephrase={rephrase} onOpenSource={(source) => openSource(turn, source)} /> : null}
                    </li>
                  ))}
                </ol>
              )}
              <Composer
                value={question}
                onChange={setQuestion}
                onSubmit={ask}
                busy={busy}
                documents={ready}
                scope={scope}
                onScopeChange={setScope}
                inputRef={composerRef}
              />
            </div>
          </div>
          <SourcesPanel sources={activeSources} activeMarker={activeMarker} />
        </div>
      ) : null}

      <Dialog open={sheetOpen} title="Sources" variant="sheet" onClose={() => setSheetOpen(false)} className="xl:hidden">
        <SourcesList sources={activeSources} activeMarker={activeMarker} />
      </Dialog>
    </PageContainer>
  );
}
