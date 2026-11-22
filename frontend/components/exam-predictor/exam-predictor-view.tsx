"use client";

import { useEffect, useRef, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ApiError } from "@/lib/api-client";
import { examApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { ExamPrediction } from "@/types/api";
import { EvidenceItem, TopicCard } from "./topic-card";

function Results({ prediction }: { prediction: ExamPrediction }) {
  const questions = prediction.papers.reduce((n, p) => n + p.question_count, 0);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Read {prediction.papers.length} past papers and {questions} questions. {prediction.rule}
      </p>
      {prediction.topics.length > 0 ? (
        <ol aria-label="Topics by likelihood" className="flex flex-col gap-3">
          {prediction.topics.map((topic, i) => (
            <TopicCard key={topic.topic_id} topic={topic} rank={i + 1} />
          ))}
        </ol>
      ) : (
        <p className="rounded-panel border border-dashed border-stone-strong/40 px-6 py-8 text-center text-sm text-ink-2">No past question matched any of your topics closely enough to rank them.</p>
      )}
      {prediction.unmatched.length > 0 ? (
        <Panel title={`Unmatched questions (${prediction.unmatched.length})`}>
          <p className="mb-3 text-small text-ink-2">These past questions did not match any of your topics closely enough, so they are not counted. Add notes that cover them and they will be matched.</p>
          <ul className="divide-y divide-stone">
            {prediction.unmatched.map((q) => (
              <EvidenceItem key={q.question_id} q={q} />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

export function ExamPredictorView() {
  const loaded = useApi(examApi.get);
  const [analysed, setAnalysed] = useState<ExamPrediction | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const prediction = analysed ?? loaded.data;

  async function analyse() {
    setAnalysing(true);
    setError(null);
    try {
      setAnalysed(await examApi.analyse());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not read your past papers. Please try again.");
    } finally {
      setAnalysing(false);
    }
  }

  // Papers not read yet are read automatically, once, when the page opens
  useEffect(() => {
    if (!loaded.data || started.current) return;
    if (loaded.data.status === "ok" && loaded.data.pending_papers > 0) {
      started.current = true;
      queueMicrotask(() => void analyse()); // not inside the effect itself: it sets state
    }
  }, [loaded.data]);

  return (
    <PageContainer>
      <PageHeader title="Exam predictor" />
      {loaded.loading ? <LoadingBlock label="Loading" /> : null}
      {loaded.error && !prediction ? <ErrorBlock message={loaded.error.message} onRetry={loaded.reload} /> : null}
      {analysing ? <LoadingBlock label="Reading your past papers. This can take a minute" /> : null}
      {error ? <ErrorBlock message={error} onRetry={() => void analyse()} /> : null}

      {prediction && prediction.status !== "ok" ? (
        <EmptyState
          title={prediction.status === "need_more_papers" ? "Add more past papers" : prediction.status === "no_papers" ? "No past papers yet" : "Add your study material"}
          action={<ButtonLink href="/library">Go to My library</ButtonLink>}
        >
          {prediction.message}
        </EmptyState>
      ) : null}

      {prediction && prediction.status === "ok" ? (
        <div className="flex flex-col gap-4">
          {prediction.failed_papers > 0 || (prediction.pending_papers > 0 && !analysing && !error) ? (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-panel bg-stone-100 px-4 py-3 text-sm text-ink">
              {prediction.pending_papers} past {prediction.pending_papers === 1 ? "paper has" : "papers have"} not been read yet.
              <Button size="sm" variant="secondary" onClick={() => void analyse()} loading={analysing}>
                Read them now
              </Button>
            </div>
          ) : null}
          {prediction.pending_papers < prediction.papers.length ? <Results prediction={prediction} /> : null}
          <p className="text-small font-medium text-ink-2">{prediction.disclaimer}</p>
        </div>
      ) : null}
      {prediction && prediction.status !== "ok" ? <p className="mt-4 text-small font-medium text-ink-2">{prediction.disclaimer}</p> : null}
    </PageContainer>
  );
}
