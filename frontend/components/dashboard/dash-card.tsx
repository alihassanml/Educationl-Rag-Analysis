import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  /** A short link on the right of the title */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** One dashboard card: a plain title, then content. Every card has the same padding and title size,
 *  and cards in a row stretch to the same height. */
export function DashCard({ title, action, children, className }: Props) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col rounded-panel border border-stone bg-paper p-5", className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export const cardLinkClass = "font-medium text-accent-link underline-offset-4 hover:underline";
