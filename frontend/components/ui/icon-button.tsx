import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: an icon alone has no text for a screen reader. Also shown as the hover tooltip. */
  label: string;
  /** Highlights the button, for a choice that is currently on (a thumbs up that was given). */
  active?: boolean;
};

/** Small quiet icon button for the actions under an answer: no border, a soft fill on hover. */
export function IconButton({ label, active, className, type = "button", children, ...props }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-[120ms]",
        "hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50",
        active && "bg-clay-soft text-accent-ink hover:bg-clay-soft hover:text-accent-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
