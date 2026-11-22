"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ApiError } from "@/lib/api-client";
import { lightModeApi } from "@/lib/api";
import { sourceLabel } from "@/lib/formatters";
import { useApi } from "@/lib/use-api";

/** A lighter step: a short recap written from the topic's own passages, then a three-question
 *  confidence quiz. Nothing here comes from outside the student's material. */
export function LightStepView() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const router = useRouter();
  const recap = useApi(() => lightModeApi.recap(episodeId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startQuiz() {
    setPending(true);
    setError(null);
    try {
      const quiz = await lightModeApi.confidenceQuiz(episodeId);
      router.push(`/quizzes/${quiz.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the quiz. Please try again.");
      setPending(false);
    }
  }

  if (recap.loading) {
    return (
      <PageContainer>
        <LoadingBlock label="Writing a quick recap from your material" />
      </PageContainer>
    );
  }
  if (!recap.data) {
    return (
      <PageContainer>
        <ErrorBlock message={recap.error?.message ?? "The recap could not be loaded."} onRetry={recap.reload} />
        <div className="mt-4">
          <ButtonLink variant="secondary" href="/course-map">
            Back to the Course Map
          </ButtonLink>
        </div>
      </PageContainer>
    );
  }
  const r = recap.data;
  return (
    <PageContainer>
      <PageHeader title={`A lighter step on ${r.topic}`} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Panel title="Quick recap">
          <p className="text-ink">{r.sentences.join(" ")}</p>
          <dl className="mt-4 space-y-3 border-t border-stone pt-4 text-sm">
            <div>
              <dt className="font-medium text-ink">Example</dt>
              <dd className="text-ink">{r.example}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Memory tip</dt>
              <dd className="text-ink">{r.memory_tip}</dd>
            </div>
          </dl>
          {r.sources.length > 0 ? <p className="mt-4 text-small text-ink-2">Source: {r.sources.map(sourceLabel).join("; ")}</p> : null}
        </Panel>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void startQuiz()} loading={pending}>
            {pending ? "Writing questions" : "Take the confidence quiz"}
          </Button>
          <ButtonLink variant="secondary" href="/course-map">
            Back to the Course Map
          </ButtonLink>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-small text-ink-2">Pass with 2 of 3 and you go back to your normal level on this topic</p>
      </div>
    </PageContainer>
  );
}
