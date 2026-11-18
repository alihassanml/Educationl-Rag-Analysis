import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** The page's one primary action */
  action?: ReactNode;
};

/** Page title (24/32), one short line, and at most one primary action. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-page font-medium text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-ink-2">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-3">{action}</div> : null}
    </header>
  );
}
