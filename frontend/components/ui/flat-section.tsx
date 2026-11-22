import type { ReactNode } from "react";

/** A titled section with a hairline above it, for lists and forms that sit on the page itself.
 *  Not every group of content needs a card around it (docs/UI_REDESIGN.md section 21). */
export function FlatSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-stone pt-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
