import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-panel border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6", className)}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
