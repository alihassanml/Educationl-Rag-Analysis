"use client";

import { Route, X } from "lucide-react";
import { useState } from "react";
import { StartDiagnosticButton } from "@/components/diagnostic/start-diagnostic-button";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { diagnosticApi, pathApi } from "@/lib/api";
import { formatRelative } from "@/lib/relative-time";
import { useApi } from "@/lib/use-api";
import type { LearningPath, PathEvent } from "@/types/api";
import { StepCard } from "./step-card";

const DISMISSED_KEY = "edurag.course-map.dismissed-event";

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null; // private windows and blocked storage: the banner simply shows again
  }
}

/** "Route updated": the latest change to the path and why, until the student closes it. */
export function RouteBanner({ event }: { event: PathEvent }) {
  const [dismissed, setDismissed] = useState<string | null>(() => (typeof window === "undefined" ? null : readDismissed()));
  if (dismissed === event.id) return null;
  return (
    <div role="status" className="flex items-start justify-between gap-4 rounded-panel bg-clay-300 px-5 py-4">
      <div className="min-w-0">
        <p className="text-small font-medium text-accent-ink">Route updated</p>
        <p className="mt-0.5 text-ink">{event.reason}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss route update"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISSED_KEY, event.id);
          } catch {
            /* nothing to remember it with: closing it for now is enough */
          }
          setDismissed(event.id);
        }}
        className="-m-1 rounded-control p-1 text-ink-2 hover:bg-stone-100 hover:text-ink"
      >
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

function History({ events }: { events: PathEvent[] }) {
  return (
    <Panel title="Route updates">
      <ul className="divide-y divide-stone">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
            <span className="text-sm text-ink">{e.reason}</span>
            <span className="text-small text-ink-2">{formatRelative(e.created_at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Path({ path }: { path: LearningPath }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {path.latest_event ? <RouteBanner event={path.latest_event} /> : null}
      <ol aria-label="Your study path" className="flex flex-col gap-3">
        {path.steps.map((step, i) => (
          <StepCard key={step.topic_id} step={step} last={i === path.steps.length - 1} />
        ))}
      </ol>
      {path.events.length > 0 ? <History events={path.events} /> : null}
      <p className="text-small text-ink-2">
        The order follows your results: topics that need revision come first, topics you are doing well on come last, and the rest keep the order of your documents. It is study guidance, not a prediction of exam results
      </p>
    </div>
  );
}

export function CourseMapView() {
  const path = useApi(pathApi.get);
  const diagnostic = useApi(diagnosticApi.status);
  const levels = path.data?.steps.filter((s) => s.level !== null) ?? [];
  return (
    <PageContainer>
      <PageHeader
        title="Course Map"
        description="Your topics in the order to study them, from your own documents and results"
        action={
          diagnostic.data?.available ? (
            <StartDiagnosticButton label={diagnostic.data.taken ? "Retake the diagnostic" : "Take the diagnostic"} variant="secondary" />
          ) : undefined
        }
      />
      {path.loading ? <LoadingBlock label="Loading your Course Map" /> : null}
      {path.error && !path.data ? <ErrorBlock message={path.error.message} onRetry={path.reload} /> : null}
      {path.data && path.data.steps.length === 0 ? (
        <EmptyState title="Your Course Map is empty" icon={Route} action={<ButtonLink href="/library">Go to My library</ButtonLink>}>
          Upload a document and its topics will appear here, in the order to study them
        </EmptyState>
      ) : null}
      {path.data && path.data.steps.length > 0 ? <Path path={path.data} /> : null}
      {path.data && path.data.steps.length > 0 && levels.length === 0 && diagnostic.data?.suggested ? (
        <p className="mt-6 max-w-3xl text-small text-ink-2">Take the diagnostic to set the level each topic starts at</p>
      ) : null}
    </PageContainer>
  );
}

