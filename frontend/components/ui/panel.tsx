import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Card surfaces. `card` is paper with a stone border; `card-muted` is the stone-100 fill (no border).
 *  Neither has a shadow at rest. Never nest one card inside another: use a divider or an inset well. */
export function cardStyles(muted = false, className?: string): string {
  return cn("rounded-panel p-5", muted ? "bg-stone-100" : "border border-stone bg-paper", className);
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  muted = false,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <section className={cardStyles(muted, className)}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title ? (
            <div>
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              {description ? <p className="mt-0.5 text-sm text-ink-2">{description}</p> : null}
            </div>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
