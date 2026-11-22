import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "success" | "warning" | "danger" | "clay";

const tones: Record<ChipTone, string> = {
  neutral: "bg-stone text-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  clay: "bg-clay-soft text-accent-ink",
};

/** 24px pill. The label is always text, so status never relies on colour alone. */
export function Chip({ tone = "neutral", children, className }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center rounded-full px-3 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
