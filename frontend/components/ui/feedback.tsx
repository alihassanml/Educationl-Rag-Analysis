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

/** Plain-language message and a Retry button. Never a raw stack trace. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-panel border border-stone bg-paper p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-ink">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

type Tone = "info" | "success" | "warning";

const notice: Record<Tone, string> = {
  info: "bg-stone-100 text-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
};

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role="status" className={cn("rounded-panel px-4 py-3 text-sm", notice[tone])}>
      {children}
    </div>
  );
}

/** Title, at most one short sentence, one primary action. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-stone-strong/40 px-6 py-8 text-center">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children ? <div className="mx-auto mt-1 max-w-prose text-ink-2">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
