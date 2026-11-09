import { cn } from "@/lib/cn";
import type { DocumentStatus, EvalRunStatus, TopicStatus } from "@/types/api";

const topicStyles: Record<TopicStatus, { label: string; className: string }> = {
  needs_revision: { label: "Needs revision", className: "text-danger border-danger/30" },
  practicing: { label: "Practicing", className: "text-warning border-warning/30" },
  doing_well: { label: "Doing well", className: "text-success border-success/30" },
  insufficient_data: { label: "Not enough data", className: "text-muted border-border" },
};

const documentStyles: Record<DocumentStatus, { label: string; className: string }> = {
  ready: { label: "Ready", className: "text-success border-success/30" },
  processing: { label: "Processing", className: "text-warning border-warning/30" },
  uploaded: { label: "Uploaded", className: "text-muted border-border" },
  failed: { label: "Failed", className: "text-danger border-danger/30" },
};

const runStyles: Record<EvalRunStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "text-muted border-border" },
  running: { label: "Running", className: "text-warning border-warning/30" },
  completed: { label: "Completed", className: "text-success border-success/30" },
  failed: { label: "Failed", className: "text-danger border-danger/30" },
};

function Label({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

export function TopicStatusLabel({ status }: { status: TopicStatus }) {
  return <Label {...topicStyles[status]} />;
}

export function DocumentStatusLabel({ status }: { status: DocumentStatus }) {
  return <Label {...documentStyles[status]} />;
}

export function RunStatusLabel({ status }: { status: EvalRunStatus }) {
  return <Label {...runStyles[status]} />;
}
