"use client";

import { FileText, FileUp, Globe, Type } from "lucide-react";
import { useId, useState, type DragEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { KINDS } from "@/lib/document-kinds";
import type { DocumentKind } from "@/types/api";
import { cn } from "@/lib/cn";
import { MAX_TEXT_CHARS, MAX_UPLOAD_MB } from "@/lib/validators";
import type { UploadState } from "./use-upload";

type Tab = "pdf" | "link" | "text";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "pdf", label: "PDF file", icon: FileUp },
  { id: "link", label: "Link", icon: Globe },
  { id: "text", label: "Paste text", icon: Type },
];

/** Three ways to add material. The file input and status line are always mounted, so a normal file
 *  picker works everywhere and drag and drop is only an enhancement. */
export function UploadPanel({ state, showPanel }: { state: UploadState; showPanel: boolean }) {
  const { inputRef, uploading, error, upload, addLink, addText, choose, kind, setKind, examYear, setExamYear, examSession, setExamSession } = state;
  const [tab, setTab] = useState<Tab>("pdf");
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const ids = useId();

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !uploading) void upload(file);
  }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    if (await addLink(link)) setLink("");
  }

  async function submitText(event: FormEvent) {
    event.preventDefault();
    if (await addText(title, text)) {
      setTitle("");
      setText("");
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        id="pdf-upload"
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a PDF file"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {showPanel ? (
        <div className="rounded-panel border border-stone bg-paper p-5 sm:p-6">
          <div role="tablist" aria-label="How to add material" className="mb-5 inline-flex gap-1 rounded-lg bg-stone-100 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${ids}-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`${ids}-panel`}
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-[120ms]",
                  tab === id ? "bg-paper text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                )}
              >
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="mb-5 flex max-w-xl flex-wrap items-end gap-4">
            <Field id={`${ids}-kind`} label="What is this?" hint={KINDS.find((k) => k.value === kind)?.hint}>
              <Select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)} disabled={uploading} aria-describedby={`${ids}-kind-hint`}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            {kind === "past_paper" ? (
              <>
                <Field id={`${ids}-year`} label="Exam year">
                  <Input id={`${ids}-year`} inputMode="numeric" maxLength={4} className="w-24" value={examYear} onChange={(e) => setExamYear(e.target.value.replace(/\D/g, ""))} disabled={uploading} placeholder="2025" />
                </Field>
                <Field id={`${ids}-session`} label="Session">
                  <Input id={`${ids}-session`} maxLength={50} className="w-36" value={examSession} onChange={(e) => setExamSession(e.target.value)} disabled={uploading} placeholder="Summer" />
                </Field>
              </>
            ) : null}
          </div>

          <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${tab}`}>
            {tab === "pdf" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
                  dragging ? "border-clay bg-clay-soft" : "border-stone-strong bg-stone-100",
                )}
              >
                <FileUp size={24} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
                <h2 className="text-base font-semibold text-ink">Drop a PDF here or choose a file</h2>
                <p className="max-w-prose text-ink-2">Notes, textbooks, slides or past papers. Text-based PDFs up to {MAX_UPLOAD_MB} MB.</p>
                <Button variant="secondary" onClick={choose} loading={uploading}>
                  {uploading ? "Processing" : "Choose file"}
                </Button>
              </div>
            ) : null}

            {tab === "link" ? (
              <form onSubmit={submitLink} className="flex max-w-xl flex-col gap-4" noValidate>
                <Field id={`${ids}-link`} label="Web address" hint="A web page, or a link to a PDF anywhere online">
                  <Input
                    id={`${ids}-link`}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://example.com/lecture-notes.pdf"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    disabled={uploading}
                    aria-describedby={`${ids}-link-hint`}
                  />
                </Field>
                <div>
                  <Button type="submit" loading={uploading} disabled={link.trim() === ""}>
                    {uploading ? "Reading the link" : "Add link"}
                  </Button>
                </div>
              </form>
            ) : null}

            {tab === "text" ? (
              <form onSubmit={submitText} className="flex max-w-2xl flex-col gap-4" noValidate>
                <Field id={`${ids}-title`} label="Title">
                  <Input id={`${ids}-title`} value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} disabled={uploading} placeholder="Week 3 lecture notes" />
                </Field>
                <Field id={`${ids}-text`} label="Text" hint={`Up to ${MAX_TEXT_CHARS.toLocaleString("en")} characters`}>
                  <Textarea
                    id={`${ids}-text`}
                    rows={8}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={uploading}
                    placeholder="Paste your notes, an article or a transcript"
                    aria-describedby={`${ids}-text-hint`}
                  />
                </Field>
                <div>
                  <Button type="submit" loading={uploading} disabled={text.trim() === ""}>
                    {uploading ? "Processing" : "Add text"}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
      <div id="upload-status" aria-live="polite" className={cn("text-sm", (uploading || error) && "mt-3")}>
        {uploading ? <p className="text-ink-2">Reading and indexing your material. Larger files take longer</p> : null}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
