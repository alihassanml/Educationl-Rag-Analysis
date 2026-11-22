import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  /** Small link or meta text on the right of the header */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** One dashboard card: a plain title row (no decorative icon), then content that fills the card's height. */
export function DashCard({ title, action, children, className }: Props) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col rounded-panel border border-stone bg-paper p-5", className)}>
      <header className="mb-4 flex min-h-6 items-center justify-between gap-3">
        <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
        {action ? <div className="shrink-0 text-sm">{action}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export const cardLinkClass = "font-medium text-accent-link underline-offset-4 hover:underline";
