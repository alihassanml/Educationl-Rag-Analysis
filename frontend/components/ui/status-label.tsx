import { Chip, type ChipTone } from "@/components/ui/chip";
import type { DocumentStatus, EvalRunStatus, TopicStatus } from "@/types/api";

type Style = { label: string; tone: ChipTone };

const topicStyles: Record<TopicStatus, Style> = {
  needs_revision: { label: "Needs revision", tone: "danger" },
  practicing: { label: "Practising", tone: "warning" },
  doing_well: { label: "Doing well", tone: "success" },
  insufficient_data: { label: "Not enough data", tone: "neutral" },
};

const documentStyles: Record<DocumentStatus, Style> = {
  ready: { label: "Ready", tone: "success" },
  processing: { label: "Processing", tone: "warning" },
  uploaded: { label: "Uploaded", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

const runStyles: Record<EvalRunStatus, Style> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

function Label({ label, tone }: Style) {
  return <Chip tone={tone}>{label}</Chip>;
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
