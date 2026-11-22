"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** "lg" is the wide 48px bar of a page that is mostly a list; "md" sits in a toolbar beside other controls */
  size?: "md" | "lg";
  className?: string;
};

/** Search box with a leading icon and a clear button. Escape clears it. */
export function SearchInput({ value, onChange, label, placeholder = label, autoFocus, size = "md", className }: Props) {
  const lg = size === "lg";
  return (
    <div className={cn("relative", className)}>
      <Search size={lg ? 18 : 16} strokeWidth={1.75} className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-2", lg ? "left-4" : "left-3")} aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        className={cn(
          "w-full rounded-full border border-stone bg-stone-50 text-ink placeholder:text-ink-3 focus-visible:outline-none! focus-visible:border-accent-link focus-visible:bg-paper focus-visible:ring-4 focus-visible:ring-clay-200 [&::-webkit-search-cancel-button]:hidden",
          lg ? "h-12 pl-11 pr-11 text-base" : "h-9 pl-9 pr-9 text-sm",
        )}
      />
      {value ? (
        <IconButton label="Clear search" onClick={() => onChange("")} className={cn("absolute top-1/2 -translate-y-1/2 rounded-full", lg ? "right-2" : "right-0.5 size-8")}>
          <X size={lg ? 16 : 14} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  );
}
