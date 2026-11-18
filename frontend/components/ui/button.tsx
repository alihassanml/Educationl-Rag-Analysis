import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-clay-strong text-paper hover:bg-clay-stronger active:bg-clay-stronger",
  secondary: "border border-stone bg-paper text-ink hover:bg-stone-100 active:bg-stone",
  ghost: "text-ink hover:bg-stone-100 active:bg-stone",
  // Outline at rest; the confirm dialog uses `danger` (filled) for the final step
  destructive: "border border-danger bg-paper text-danger hover:bg-danger-soft",
  danger: "bg-danger text-paper hover:opacity-90",
};

// Heights 32, 36 (default) and 40 (marketing, touch targets)
const sizes: Record<Size, string> = {
  sm: "h-8 px-3",
  md: "h-9 px-4",
  lg: "h-10 px-5",
};

export function buttonStyles(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium",
    "transition-colors duration-[120ms] ease-standard disabled:cursor-not-allowed disabled:opacity-50",
    "max-sm:min-h-10",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, disables the button and sets aria-busy. The label stays so the width does not jump. */
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, type = "button", disabled, children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonStyles(variant, size, className)} {...props} />;
}
