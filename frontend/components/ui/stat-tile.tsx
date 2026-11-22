import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  label: string;
  /** `null` or `undefined` renders a dash and "No data yet", never a fake zero. */
  value: string | number | null | undefined;
  context?: ReactNode;
  className?: string;
  /** No fill or padding of its own, for use inside a surface that is already a card (never nest cards). */
  bare?: boolean;
};

export function StatTile({ label, value, context, className, bare }: Props) {
  const empty = value === null || value === undefined;
  return (
    <div className={cn(!bare && "rounded-panel bg-stone-100 p-5", className)}>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-2 text-metric font-semibold tracking-tight text-ink">{empty ? "—" : value}</p>
      <p className="mt-1 text-small text-ink-2">{empty ? "No data yet" : context}</p>
    </div>
  );
}
