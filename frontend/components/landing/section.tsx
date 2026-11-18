import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { cn } from "@/lib/cn";

/** Landing section: 96px vertical padding on desktop, 64px on mobile, paper or stone-50 background. */
export function Section({ id, tone = "paper", children, className }: { id?: string; tone?: "paper" | "muted"; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-16", tone === "muted" ? "bg-stone-50" : "bg-paper")}>
      <PageContainer padded={false} className={cn("py-16 lg:py-24", className)}>
        {children}
      </PageContainer>
    </section>
  );
}

export function SectionHeading({ overline, title, lead }: { overline?: string; title: string; lead?: string }) {
  return (
    <div className="mb-8 max-w-2xl lg:mb-12">
      {overline ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">{overline}</p> : null}
      <h2 className="text-h1 font-medium text-ink lg:text-h1-lg">{title}</h2>
      {lead ? <p className="mt-3 text-lead text-ink-2">{lead}</p> : null}
    </div>
  );
}
