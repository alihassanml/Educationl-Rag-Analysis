"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/use-dismiss";

export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  href?: string;
  onSelect?: () => void;
  destructive?: boolean;
};

/** Row menu. Button opens a menu; arrow keys move, Esc closes and returns focus to the button. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(root, open, () => setOpen(false));

  function focusItem(delta: number | "first" | "last") {
    const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (nodes.length === 0) return;
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    const next = delta === "first" ? 0 : delta === "last" ? nodes.length - 1 : (current + delta + nodes.length) % nodes.length;
    nodes[next].focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const moves: Record<string, number | "first" | "last"> = { ArrowDown: 1, ArrowUp: -1, Home: "first", End: "last" };
    if (event.key in moves) {
      event.preventDefault();
      focusItem(moves[event.key]);
    } else if (event.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
    }
  }

  const itemClass = (destructive?: boolean) =>
    cn(
      "flex h-9 w-full items-center gap-2 rounded-control px-3 text-left text-sm hover:bg-stone-100 focus-visible:bg-stone-100",
      destructive ? "text-danger" : "text-ink",
    );

  return (
    <div ref={root} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-stone-100 hover:text-ink max-sm:size-10"
      >
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label={label} className="absolute right-0 z-20 mt-1 w-52 rounded-panel border border-stone bg-paper p-1 shadow-md">
          {items.map(({ label: text, icon: Icon, href, onSelect, destructive }) =>
            href ? (
              <Link key={text} role="menuitem" href={href} className={itemClass(destructive)} onClick={() => setOpen(false)}>
                {Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
                {text}
              </Link>
            ) : (
              <button
                key={text}
                type="button"
                role="menuitem"
                className={itemClass(destructive)}
                onClick={() => {
                  setOpen(false);
                  onSelect?.();
                }}
              >
                {Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
                {text}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
