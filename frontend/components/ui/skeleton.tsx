import { cn } from "@/lib/cn";

/** Stone block that stands in for content. The pulse is off under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-control bg-stone motion-reduce:animate-none", className)} />;
}
