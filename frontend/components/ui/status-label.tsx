import { AlertCircle, CheckCircle2, CircleDashed, Clock, Loader2, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import type { DocumentStatus, EvalRunStatus, TopicStatus } from "@/types/api";

type Style = { label: string; tone: ChipTone; icon: LucideIcon };

const topicStyles: Record<TopicStatus, Style> = {
  needs_revision: { label: "Needs revision", tone: "danger", icon: AlertCircle },
  practicing: { label: "Practising", tone: "warning", icon: TrendingUp },
  doing_well: { label: "Doing well", tone: "success", icon: CheckCircle2 },
  insufficient_data: { label: "Not enough data", tone: "neutral", icon: CircleDashed },
};

const documentStyles: Record<DocumentStatus, Style> = {
  ready: { label: "Ready", tone: "success", icon: CheckCircle2 },
  processing: { label: "Processing", tone: "warning", icon: Loader2 },
  uploaded: { label: "Uploaded", tone: "neutral", icon: Clock },
  failed: { label: "Failed", tone: "danger", icon: AlertCircle },
};

const runStyles: Record<EvalRunStatus, Style> = {
  queued: { label: "Queued", tone: "neutral", icon: Clock },
  running: { label: "Running", tone: "warning", icon: Loader2 },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "danger", icon: AlertCircle },
};

function Label({ label, tone, icon }: Style) {
  return (
    <Chip tone={tone} icon={icon}>
      {label}
    </Chip>
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
