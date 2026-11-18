import { cn } from "@/lib/cn";

type Props = {
  label: string;
  /** `null` or `undefined` renders a dash and "No data yet", never a fake zero. */
  value: string | number | null | undefined;
  context?: string;
  className?: string;
};

export function StatTile({ label, value, context, className }: Props) {
  const empty = value === null || value === undefined;
  return (
    <div className={cn("rounded-panel bg-stone-100 p-5", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">{label}</p>
      <p className="mt-2 text-metric font-medium text-ink">{empty ? "—" : value}</p>
      <p className="mt-1 text-small text-ink-2">{empty ? "No data yet" : context}</p>
    </div>
  );
}
