import { cn } from "@/lib/cn";

/** Stone track, clay fill, numeric label beside it (never colour alone). */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="h-2 flex-1 overflow-hidden rounded-full bg-stone"
      >
        <div className="h-full rounded-full bg-clay" style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-10 text-right text-small font-medium text-ink">{Math.round(clamped)}%</span>
    </div>
  );
}
