import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "success" | "warning" | "danger" | "clay";

const tones: Record<ChipTone, string> = {
  neutral: "bg-stone text-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  clay: "bg-clay-soft text-clay-stronger",
};

/** 24px pill. The label is always text, so status never relies on colour alone. */
export function Chip({ tone = "neutral", icon: Icon, children, className }: { tone?: ChipTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {Icon ? <Icon size={12} strokeWidth={1.75} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
