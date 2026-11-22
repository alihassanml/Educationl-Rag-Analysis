import Link from "next/link";
import { cn } from "@/lib/cn";

/** The EduRAG mark: a citation bracket around a point, because every answer points back to its source.
 *  Colours are fixed brand values so the mark looks the same on every surface (also in app/icon.svg). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7 shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="#151a2e" />
      <path d="M12.5 9.5H9.5V22.5H12.5M19.5 9.5H22.5V22.5H19.5" fill="none" stroke="#baccf4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.25" fill="#ffffff" />
    </svg>
  );
}

/** Mark and name, linking home. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-ink", className)}>
      <LogoMark />
      EduRAG
    </Link>
  );
}
