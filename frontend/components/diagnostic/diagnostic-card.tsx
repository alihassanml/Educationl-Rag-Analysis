import { DashCard } from "@/components/dashboard/dash-card";
import type { DiagnosticStatus } from "@/types/api";
import { StartDiagnosticButton } from "./start-diagnostic-button";

/** Dashboard card for a student who has material but has never taken the diagnostic. */
export function DiagnosticCard({ status }: { status: DiagnosticStatus }) {
  if (!status.suggested) return null;
  const resume = status.pending_quiz_id !== null;
  return (
    <DashCard title="Diagnostic">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink">{status.topic_count} topics, one or two questions each.</p>
        <StartDiagnosticButton label={resume ? "Continue your diagnostic" : "Start your diagnostic"} />
      </div>
    </DashCard>
  );
}
