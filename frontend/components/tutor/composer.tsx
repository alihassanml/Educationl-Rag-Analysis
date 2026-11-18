"use client";

import { ArrowUp, FileText } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/use-dismiss";
import type { StudyDocument } from "@/types/api";
import { ScopeSelector } from "./scope-selector";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  documents: StudyDocument[];
  scope: string[];
  onScopeChange: (ids: string[]) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
};

const MIN_QUESTION_LENGTH = 3;

/** Sticky composer: auto-growing textarea (1 to 6 lines). Enter sends, Shift+Enter adds a line. */
export function Composer({ value, onChange, onSubmit, busy, documents, scope, onScopeChange, inputRef }: Props) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRoot = useRef<HTMLDivElement>(null);
  useDismiss(scopeRoot, scopeOpen, () => setScopeOpen(false));

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`; // 6 lines of 24px
  }, [value, inputRef]);

  const canSend = !busy && value.trim().length >= MIN_QUESTION_LENGTH;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canSend) onSubmit();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const scopeLabel = scope.length === 0 ? "All my documents" : `${scope.length} ${scope.length === 1 ? "document" : "documents"}`;

  return (
    <form onSubmit={submit} className="sticky bottom-4 z-10 rounded-composer border border-stone bg-paper p-3 shadow-md">
      <label htmlFor="question" className="sr-only">
        Your question
      </label>
      <textarea
        ref={inputRef}
        id="question"
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={1000}
        placeholder="Ask a question about your material"
        className="max-h-36 w-full resize-none bg-transparent px-2 py-1 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div ref={scopeRoot} className="relative">
          <button
            type="button"
            aria-expanded={scopeOpen}
            aria-controls="scope-popover"
            onClick={() => setScopeOpen((v) => !v)}
            disabled={busy}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border border-stone px-3 text-small text-ink-2 hover:bg-stone-100 disabled:opacity-50",
              scope.length > 0 && "border-clay bg-clay-soft text-clay-stronger",
            )}
          >
            <FileText size={14} strokeWidth={1.75} aria-hidden="true" />
            {scopeLabel}
          </button>
          {scopeOpen ? (
            <div id="scope-popover" className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-[calc(100vw-3rem)] rounded-panel border border-stone bg-paper p-2 shadow-md">
              <ScopeSelector documents={documents} selected={scope} onChange={onScopeChange} />
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send question"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-clay-strong text-paper transition-colors duration-[120ms] hover:bg-clay-stronger disabled:cursor-not-allowed disabled:opacity-50 max-sm:size-10"
        >
          <ArrowUp size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
