import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  /** The page's actions, right-aligned with the title (at most one primary) */
  action?: ReactNode;
};

/** Every page starts the same way: a large title and the page's actions on the right. No intro text. */
export function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 text-page font-semibold tracking-tight text-ink">{title}</h1>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
