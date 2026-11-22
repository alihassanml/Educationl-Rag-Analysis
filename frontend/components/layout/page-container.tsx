import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The one place side padding and max width are set (docs/UI_REDESIGN.md section 5.1):
 *  16px below 640px, 24px from 640px, 32px from 1280px; content is at most 1200px wide. */
export const PAGE_GUTTER = "px-4 sm:px-6 xl:px-8";

type Props = {
  children: ReactNode;
  className?: string;
  /** App pages get 24px (mobile) or 32px (desktop) top padding and bottom space. Landing sections turn it off. */
  padded?: boolean;
  as?: "div" | "section" | "header" | "footer" | "nav";
  /** Fill the whole area beside the sidebar instead of stopping at 1200px. The side padding stays. */
  full?: boolean;
};

export function PageContainer({ children, className, padded = true, full = false, as: Tag = "div" }: Props) {
  return (
    <Tag className={cn("w-full", PAGE_GUTTER, padded && "py-6 lg:py-8")}>
      <div className={cn("w-full", !full && "mx-auto max-w-[1200px]", className)}>{children}</div>
    </Tag>
  );
}
