import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} size={16} aria-hidden="true" />;
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-10 text-muted">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-panel border border-danger/30 bg-surface p-4 sm:flex-row sm:items-center"
    >
      <div className="flex flex-1 items-start gap-2 text-danger">
        <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning"; children: ReactNode }) {
  const tones = {
    info: "border-border bg-surface text-foreground",
    success: "border-success/30 bg-selected text-success",
    warning: "border-warning/30 bg-surface text-warning",
  };
  return (
    <div role="status" className={cn("rounded-panel border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-border bg-surface px-6 py-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="mx-auto mt-1 max-w-prose text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
