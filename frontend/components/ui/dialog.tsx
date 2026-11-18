"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "dialog" is centred (radius 12, shadow-lg). "sheet" slides in from the right, or up from the bottom on phones. */
  variant?: "dialog" | "sheet";
  className?: string;
};

/** Native <dialog>: focus is trapped, Esc closes (reported through onClose), the backdrop dims the page. */
export function Dialog({ open, title, onClose, children, variant = "dialog", className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    // A modal left open in the top layer would keep the whole page inert, for example when the route changes
    // and Next keeps the old page mounted but hidden. Close it whenever this component is hidden or removed.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // click on the backdrop
      }}
      className={cn(
        "border border-stone bg-paper p-0 text-ink backdrop:bg-ink/40",
        variant === "dialog"
          ? "m-auto w-[calc(100%-2rem)] max-w-lg rounded-panel shadow-lg"
          : "fixed m-0 max-h-none w-full max-w-none rounded-t-panel shadow-lg max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[80vh] sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-w-sm sm:rounded-none",
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-stone px-6 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 inline-flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-stone-100">
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto p-6">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
