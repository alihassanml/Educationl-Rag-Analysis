import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** The page's actions, right-aligned with the title (at most one primary) */
  action?: ReactNode;
};

/** Every page starts the same way: a 24px title, one short line of context, and the actions on the right. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-page font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-sm text-ink-2">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
