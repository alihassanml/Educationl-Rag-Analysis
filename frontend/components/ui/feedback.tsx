import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";

export { Spinner };

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 py-6">
      <p className="flex items-center gap-2 text-ink-2">
        <Spinner />
        <span>{label}</span>
      </p>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

/** Danger icon, plain-language message and a Retry button. Never a raw stack trace. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-panel border border-stone bg-paper p-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-2 text-danger">
        <AlertCircle size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-ink">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

type Tone = "info" | "success" | "warning";

const notice: Record<Tone, { className: string; icon: LucideIcon }> = {
  info: { className: "bg-stone-100 text-ink", icon: Info },
  success: { className: "bg-success-soft text-success", icon: CheckCircle2 },
  warning: { className: "bg-warning-soft text-warning", icon: TriangleAlert },
};

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const { className, icon: Icon } = notice[tone];
  return (
    <div role="status" className={cn("flex items-start gap-2 rounded-panel px-4 py-3 text-sm", className)}>
      <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/** card-muted, 24px icon, title, one sentence, one primary action. */
export function EmptyState({ title, children, action, icon: Icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-panel bg-stone-100 px-6 py-10 text-center">
      {Icon ? <Icon size={24} strokeWidth={1.75} className="mx-auto mb-3 text-ink-2" aria-hidden="true" /> : null}
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children ? <div className="mx-auto mt-1 max-w-prose text-ink-2">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
