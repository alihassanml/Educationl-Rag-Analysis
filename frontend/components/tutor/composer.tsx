"use client";

import { ArrowUp, FileText, Link2, Paperclip, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";
import { isLoneLink } from "@/lib/validators";
import { useDismiss } from "@/lib/use-dismiss";
import type { StudyDocument } from "@/types/api";
import { CHAT_MODES, modeOf, type ChatMode } from "./modes";
import { ScopeSelector } from "./scope-selector";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** An answer is being written: Send becomes Stop, and sending another question waits. */
  streaming: boolean;
  onStop: () => void;
  documents: StudyDocument[];
  scope: string[];
  onScopeChange: (ids: string[]) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** A PDF attached, pasted or dropped on the composer. It is added to the library as a source. */
  onAttachPdf?: (file: File) => void;
  /** A source is being read; shown as a status line. */
  adding?: string | null;
  addError?: string | null;
};

const MIN_QUESTION_LENGTH = 2;

/** Sticky composer: auto-growing textarea (1 to 6 lines). Enter sends, Shift+Enter adds a line. */
export function Composer({ value, onChange, onSubmit, streaming, onStop, documents, scope, onScopeChange, inputRef, mode, onModeChange, onAttachPdf, adding, addError }: Props) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRoot = useRef<HTMLDivElement>(null);
  useDismiss(scopeRoot, scopeOpen, () => setScopeOpen(false));

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`; // 6 lines of 24px
  }, [value, inputRef]);

  const fileInput = useRef<HTMLInputElement>(null);
  const link = isLoneLink(value); // a pasted link is added as a source instead of being asked
  const canSend = !streaming && !adding && value.trim().length >= MIN_QUESTION_LENGTH;

  const pdfIn = (files: FileList | null | undefined) => Array.from(files ?? []).find((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));

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
    <div className="rounded-composer bg-stone-100 p-2">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a PDF to add"
        onChange={(e) => {
          const file = pdfIn(e.target.files);
          if (file) onAttachPdf?.(file);
          e.target.value = "";
        }}
      />
      <form
        onSubmit={submit}
        onDragOver={(e) => onAttachPdf && e.preventDefault()}
        onDrop={(e) => {
          const file = pdfIn(e.dataTransfer.files);
          if (file && onAttachPdf) {
            e.preventDefault();
            onAttachPdf(file);
          }
        }}
        className="rounded-composer border border-stone bg-paper p-3 shadow-md transition-shadow focus-within:border-accent-link focus-within:ring-4 focus-within:ring-clay-200">
        <div className="flex items-end gap-3">
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
            onPaste={(e) => {
              const file = pdfIn(e.clipboardData.files);
              if (file && onAttachPdf) {
                e.preventDefault();
                onAttachPdf(file);
              }
            }}
            maxLength={1000}
            placeholder={modeOf(mode).placeholder}
            className="max-h-36 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none!"
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop answer"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-strong bg-paper text-ink transition-colors duration-[120ms] hover:bg-stone-100"
            >
              <Square size={14} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label={link ? "Add link to library" : "Send question"}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clay-strong text-on-accent transition-colors duration-[120ms] hover:bg-clay-stronger disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowUp size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
        {link ? (
          <p className="mt-1 flex items-center gap-1.5 px-2 text-small text-accent-ink">
            <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
            Press Enter to add this link to your library
          </p>
        ) : null}
        {adding ? (
          <p role="status" className="mt-1 px-2 text-small text-ink-2">
            {adding}
          </p>
        ) : null}
        {addError ? (
          <p role="alert" className="mt-1 px-2 text-small text-danger">
            {addError}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onAttachPdf ? (
            <IconButton label="Add a PDF" onClick={() => fileInput.current?.click()} disabled={!!adding} className="-ml-1 rounded-full">
              <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          ) : null}
          <div role="group" aria-label="Answer style" className="flex flex-wrap gap-2">
            {CHAT_MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                disabled={streaming}
                onClick={() => onModeChange(id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-small font-medium transition-colors duration-[120ms] disabled:opacity-50",
                  mode === id ? "bg-clay-strong text-on-accent" : "border border-stone bg-paper text-ink hover:bg-stone-100",
                )}
              >
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        <div ref={scopeRoot} className="relative ml-auto">
          <button
            type="button"
            aria-expanded={scopeOpen}
            aria-controls="scope-popover"
            onClick={() => setScopeOpen((v) => !v)}
            disabled={streaming}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-strong bg-paper px-3 text-small text-ink hover:bg-stone-100 disabled:opacity-50",
              scope.length > 0 && "border-clay bg-clay-soft text-accent-ink",
            )}
          >
            <FileText size={14} strokeWidth={1.75} aria-hidden="true" />
            {scopeLabel}
          </button>
          {scopeOpen ? (
            <div id="scope-popover" className="absolute bottom-full right-0 z-20 mb-2 w-72 max-w-[calc(100vw-3rem)] rounded-panel border border-stone bg-paper p-2 shadow-md">
              <ScopeSelector documents={documents} selected={scope} onChange={onScopeChange} />
            </div>
          ) : null}
        </div>
        </div>
      </form>
    </div>
  );
}
