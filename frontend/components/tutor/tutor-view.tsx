"use client";

import { ArrowDown, FileSearch, History } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { ApiError } from "@/lib/api-client";
import { documentsApi, tutorApi } from "@/lib/api";
import { applyEvent, initialLive, markStopped, type LiveAnswer, type Source } from "@/lib/chat-state";
import { useApi } from "@/lib/use-api";
import type { FeedbackRating, FeedbackReason, StudyDocument, ThreadDetail } from "@/types/api";
import { AnswerBlock, type AnswerView } from "./answer-card";
import { Composer } from "./composer";
import { HistoryPanel } from "./history-panel";
import { toSources } from "./sources";
import { SourcesList, SourcesPanel } from "./sources-panel";

type Turn = {
  key: string;
  question: string;
  documentIds: string[];
  /** What was actually searched, shown only when a follow-up was rewritten */
  searchedFor: string | null;
  answer: AnswerView | null;
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

function viewOf(live: LiveAnswer, feedback: FeedbackRating | null = null): AnswerView {
  return {
    id: live.messageId,
    text: live.text,
    status: live.status,
    stage: live.stage,
    // An answer that declined has no sources to show
    sources: live.abstained ? [] : live.sources,
    abstained: live.abstained,
    error: live.error,
    feedback,
  };
}

/** Pair each saved question with the answer that followed it. */
function turnsFromThread(detail: ThreadDetail | null): Turn[] {
  if (!detail) return [];
  const turns: Turn[] = [];
  detail.messages.forEach((message, i) => {
    if (message.role === "user") {
      turns.push({
        key: message.id,
        question: message.content,
        documentIds: [],
        searchedFor: message.rewrite_used ? message.standalone_query : null,
        answer: null,
      });
      return;
    }
    const turn = turns[turns.length - 1];
    if (!turn || turn.answer) return;
    turn.answer = {
      id: message.id,
      text: message.content,
      status: message.status,
      stage: null,
      sources: message.abstained ? [] : toSources(message.citations),
      abstained: message.abstained,
      error: message.status === "failed" ? "This answer could not be completed. Try again." : undefined,
      feedback: message.feedback,
    };
    void i;
  });
  // A question that never got an answer (the connection dropped) is offered for retry
  for (const turn of turns) {
    turn.answer ??= { text: "", status: "failed", stage: null, sources: [], abstained: false, error: "This question did not get an answer. Try again." };
  }
  return turns;
}

export function TutorView({ threadId }: { threadId?: string }) {
  const docs = useApi(documentsApi.list);
  const threads = useApi(tutorApi.threads);
  const detail = useApi((signal) => (threadId ? tutorApi.thread(threadId, signal) : Promise.resolve(null)));
  const params = useSearchParams();
  const router = useRouter();

  const docParam = params.get("doc");
  const [question, setQuestion] = useState(params.get("q") ?? "");
  const [scope, setScope] = useState<string[]>(docParam ? [docParam] : []);
  const loaded = useMemo(() => turnsFromThread(detail.data), [detail.data]);
  const [edited, setEdited] = useState<Turn[] | null>(null);
  const turns = edited ?? loaded;
  const setTurns = (update: (all: Turn[]) => Turn[]) => setEdited((current) => update(current ?? loaded));

  const [activeThread, setActiveThread] = useState<string | null>(threadId ?? null);
  const [streaming, setStreaming] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  const nextKey = useRef(1);
  const threadRef = useRef<string | null>(threadId ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);

  const ready = docs.data?.items.filter((d) => d.status === "ready") ?? [];
  const suggestions = suggestionsFor(ready);
  const activeTurn = turns.find((t) => t.key === activeKey) ?? [...turns].reverse().find((t) => (t.answer?.sources.length ?? 0) > 0);
  const activeSources: Source[] = activeTurn?.answer?.sources ?? [];

  // Stop an answer that is still being written if the student leaves the page
  useEffect(() => () => abortRef.current?.abort(), []);

  // Escape stops the answer
  useEffect(() => {
    if (!streaming) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") abortRef.current?.abort();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [streaming]);

  // Follow the answer only while the student is already at the bottom; otherwise offer a button
  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      atBottom.current = el.scrollHeight - (window.scrollY + window.innerHeight) < 80;
      if (atBottom.current) setShowJump(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!streaming) return;
    if (atBottom.current) window.scrollTo({ top: document.documentElement.scrollHeight });
    else setShowJump(true);
  }, [turns, streaming]);

  useEffect(() => {
    if (activeMarker !== null) document.getElementById(`source-${activeMarker}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeMarker]);

  async function send(text: string, documentIds: string[]) {
    if (streaming) return;
    const key = `turn-${nextKey.current++}`;
    const controller = new AbortController();
    abortRef.current = controller;
    let live = initialLive();
    const show = (patch: Partial<Turn> = {}) =>
      setTurns((all) => all.map((t) => (t.key === key ? { ...t, ...patch, answer: viewOf(live) } : t)));

    atBottom.current = true;
    setNotice(null);
    setAnnouncement("");
    setStreaming(true);
    setQuestion("");
    setTurns((all) => [...all, { key, question: text, documentIds, searchedFor: null, answer: viewOf(live) }]);
    setActiveKey(key);
    setActiveMarker(null);

    try {
      if (!threadRef.current) {
        const created = await tutorApi.createThread();
        threadRef.current = created.id;
        setActiveThread(created.id);
        // The address follows the chat without remounting, so the answer keeps streaming
        window.history.replaceState(null, "", `/tutor/${created.id}`);
      }
      await tutorApi.streamMessage(
        threadRef.current,
        text,
        documentIds,
        (event) => {
          live = applyEvent(live, event);
          show(event.event === "done" && live.rewriteUsed ? { searchedFor: live.standaloneQuery ?? null } : {});
        },
        controller.signal,
      );
      if (live.status === "streaming") {
        live = { ...live, stage: null, status: "failed", error: "The connection ended before the answer was finished. Try again." };
        show();
      }
      if (live.status === "complete") setAnnouncement("Answer ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        live = markStopped(live);
      } else {
        live = { ...live, stage: null, status: "failed", error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
        setQuestion((current) => (current === "" ? text : current)); // keep the question in the composer
      }
      show();
    } finally {
      setStreaming(false);
      abortRef.current = null;
      threads.reload();
    }
  }

  function ask() {
    const text = question.trim();
    if (text.length >= 3 && !streaming) void send(text, scope);
  }

  function retry(turn: Turn) {
    setTurns((all) => all.filter((t) => t.key !== turn.key));
    setQuestion((current) => (current === turn.question ? "" : current));
    void send(turn.question, turn.documentIds);
  }

  async function rate(turn: Turn, rating: FeedbackRating, reason?: FeedbackReason) {
    const id = turn.answer?.id;
    if (!id) return;
    const previous = turn.answer?.feedback ?? null;
    const setRating = (value: FeedbackRating | null) =>
      setTurns((all) => all.map((t) => (t.key === turn.key && t.answer ? { ...t, answer: { ...t.answer, feedback: value } } : t)));
    setRating(rating);
    try {
      await tutorApi.feedback(id, rating, reason);
    } catch {
      setRating(previous);
      setNotice("Your feedback could not be saved. Please try again.");
    }
  }

  function openSource(turn: Turn, source: Source) {
    setActiveKey(turn.key);
    setActiveMarker(source.marker);
    // Below 1280px the sources open as a sheet; at 1280px and up the side panel is already visible
    if (!window.matchMedia?.("(min-width: 1280px)").matches) setSourcesOpen(true);
  }

  function newChat() {
    abortRef.current?.abort();
    threadRef.current = null;
    setActiveThread(null);
    setEdited([]);
    setActiveKey(null);
    setQuestion("");
    setNotice(null);
    setHistoryOpen(false);
    if (window.location.pathname !== "/tutor") router.push("/tutor");
  }

  async function renameThread(id: string, title: string) {
    try {
      await tutorApi.renameThread(id, title);
      threads.reload();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "The chat could not be renamed.");
    }
  }

  async function deleteThread(id: string) {
    try {
      await tutorApi.deleteThread(id);
      threads.reload();
      if (id === activeThread) newChat();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "The chat could not be deleted.");
    }
  }

  const history = (
    <HistoryPanel
      threads={threads.data ?? []}
      loading={threads.loading}
      error={threads.error?.message ?? null}
      activeId={activeThread}
      onNewChat={newChat}
      onRename={renameThread}
      onDelete={deleteThread}
      onNavigate={() => setHistoryOpen(false)}
    />
  );

  const noDocuments = !threadId && turns.length === 0 && docs.data !== null && ready.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Study tutor"
        description="Ask a question and get an answer based on your own uploaded material"
        action={
          <>
            <Button variant="secondary" className="2xl:hidden" onClick={() => setHistoryOpen(true)}>
              <History size={16} strokeWidth={1.75} aria-hidden="true" />
              History
            </Button>
            {activeSources.length > 0 ? (
              <Button variant="secondary" className="xl:hidden" onClick={() => setSourcesOpen(true)}>
                Sources ({activeSources.length})
              </Button>
            ) : null}
          </>
        }
      />
      {docs.loading || detail.loading ? <LoadingBlock label={threadId ? "Loading your chat" : "Loading your documents"} /> : null}
      {docs.error ? <ErrorBlock message={docs.error.message} onRetry={docs.reload} /> : null}
      {detail.error ? (
        <div className="flex flex-col gap-4">
          <ErrorBlock message={detail.error.message} onRetry={detail.reload} />
          <div>
            <ButtonLink href="/tutor" variant="secondary">
              Start a new chat
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {noDocuments ? (
        <EmptyState title="Upload a document first" icon={FileSearch} action={<ButtonLink href="/library">Go to My library</ButtonLink>}>
          The tutor answers from your own material, so it needs at least one processed PDF
        </EmptyState>
      ) : null}

      {!docs.loading && !detail.loading && !detail.error && !noDocuments && docs.data ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[260px_minmax(0,1fr)_340px]">
          <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] self-start overflow-y-auto rounded-panel bg-stone-100 p-4 2xl:block">{history}</aside>

          <div className="mx-auto flex w-full min-w-0 max-w-[760px] flex-col gap-6">
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
              <ol className="flex flex-col gap-10">
                {turns.map((turn) => (
                  <li key={turn.key} className="flex flex-col gap-4">
                    <div className="flex max-w-[85%] flex-col items-end gap-1 self-end">
                      <p className="rounded-panel bg-stone-100 px-4 py-2.5 text-ink">{turn.question}</p>
                      {turn.searchedFor ? <p className="text-small text-ink-2">Searched your material for: {turn.searchedFor}</p> : null}
                    </div>
                    {turn.answer ? (
                      <AnswerBlock
                        answer={turn.answer}
                        onRephrase={() => composerRef.current?.focus()}
                        onOpenSource={(source) => openSource(turn, source)}
                        onRetry={() => retry(turn)}
                        onAskAgain={streaming ? undefined : () => void send(turn.question, turn.documentIds)}
                        onFeedback={(rating, reason) => void rate(turn, rating, reason)}
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            )}

            {notice ? (
              <p role="alert" className="text-small text-danger">
                {notice}
              </p>
            ) : null}
            <div aria-live="polite" className="sr-only">
              {announcement}
            </div>

            <div className="sticky bottom-4 z-10 flex flex-col items-center gap-2">
              {showJump && streaming ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shadow-md"
                  onClick={() => {
                    atBottom.current = true;
                    setShowJump(false);
                    window.scrollTo({ top: document.documentElement.scrollHeight });
                  }}
                >
                  <ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" />
                  Jump to latest
                </Button>
              ) : null}
              <div className="w-full">
                <Composer
                  value={question}
                  onChange={setQuestion}
                  onSubmit={ask}
                  streaming={streaming}
                  onStop={() => abortRef.current?.abort()}
                  documents={ready}
                  scope={scope}
                  onScopeChange={setScope}
                  inputRef={composerRef}
                />
                {/* Said once here, not repeated under every answer */}
                <p className="mt-2 text-center text-small text-ink-2">Answers come only from your uploaded material. Check the sources before relying on one</p>
              </div>
            </div>
          </div>

          <SourcesPanel sources={activeSources} activeMarker={activeMarker} />
        </div>
      ) : null}

      <Dialog open={historyOpen} title="History" variant="sheet" side="left" onClose={() => setHistoryOpen(false)} className="2xl:hidden">
        {history}
      </Dialog>
      <Dialog open={sourcesOpen} title="Sources" variant="sheet" onClose={() => setSourcesOpen(false)} className="xl:hidden">
        <SourcesList sources={activeSources} activeMarker={activeMarker} />
      </Dialog>
    </PageContainer>
  );
}
