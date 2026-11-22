import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The one place side padding and max width are set: 16px below 640px, 24px from 640px, 32px from
 *  1024px. Content fills the area beside the sidebar and is centred (equal space on both sides)
 *  once the screen is wider than 1440px. */
export const PAGE_GUTTER = "px-4 sm:px-6 lg:px-8";

type Props = {
  children: ReactNode;
  className?: string;
  /** App pages get 24px (mobile) or 32px (desktop) top padding and bottom space. Landing sections turn it off. */
  padded?: boolean;
  as?: "div" | "section" | "header" | "footer" | "nav";
  /** Fill the whole area beside the sidebar instead of stopping at 1440px. The side padding stays. */
  full?: boolean;
  /** A reading column (a list or an article) instead of a dashboard: 768px wide, centred, with the same gutters */
  reading?: boolean;
  /** The public marketing pages keep their own 1200px column */
  site?: boolean;
};

export function PageContainer({ children, className, padded = true, full = false, reading = false, site = false, as: Tag = "div" }: Props) {
  return (
    <Tag className={cn("w-full", PAGE_GUTTER, padded && "py-6 lg:py-8")}>
      <div className={cn("w-full", reading ? "mx-auto max-w-3xl" : site ? "mx-auto max-w-[1200px]" : !full && "mx-auto max-w-[1440px]", className)}>{children}</div>
    </Tag>
  );
}
