import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Icon in a soft square, used by card headers and list rows on the dashboard. */
export function IconChip({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-control bg-clay-soft text-accent-ink", className)}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

type Props = {
  title: string;
  icon: LucideIcon;
  /** Small link or meta text on the right of the header */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** One dashboard card: icon, title, optional action, then content that fills the card's height
 *  so cards in the same row always line up. */
export function DashCard({ title, icon, action, children, className }: Props) {
  return (
    <section aria-label={title} className={cn("flex h-full min-w-0 flex-col rounded-panel border border-stone bg-paper p-5", className)}>
      <header className="mb-4 flex min-h-8 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={icon} />
          <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
        </div>
        {action ? <div className="shrink-0 text-sm">{action}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export const cardLinkClass = "font-medium text-accent-link underline-offset-4 hover:underline";
