import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One horizontal gutter and max width, shared by every screen and the top bar. */
export const PAGE_GUTTER = "px-4 sm:px-6 lg:px-8";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl py-8", PAGE_GUTTER, className)}>{children}</div>
  );
}
