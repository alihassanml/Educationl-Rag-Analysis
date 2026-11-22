import { DashCard } from "@/components/dashboard/dash-card";
import type { DiagnosticStatus } from "@/types/api";
import { StartDiagnosticButton } from "./start-diagnostic-button";

/** Dashboard card for a student who has material but has never taken the diagnostic. */
export function DiagnosticCard({ status }: { status: DiagnosticStatus }) {
  if (!status.suggested) return null;
  const resume = status.pending_quiz_id !== null;
  return (
    <DashCard title="Start your diagnostic">
      <p className="text-sm text-ink">
        A short test with one or two questions on each of the {status.topic_count} topics found in your material. Your answers set where each topic starts, so quizzes begin at the right level.
      </p>
      <div className="mt-4">
        <StartDiagnosticButton label={resume ? "Continue your diagnostic" : "Start your diagnostic"} />
      </div>
    </DashCard>
  );
}
