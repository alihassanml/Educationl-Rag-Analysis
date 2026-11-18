"use client";

import { FileUp } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { MAX_UPLOAD_MB } from "@/lib/validators";
import type { UploadState } from "./use-upload";

/** The file input and status line are always mounted. The large dropzone card is the empty state;
 *  a normal file picker always works and drag and drop is only an enhancement. */
export function UploadPanel({ state, showDropzone }: { state: UploadState; showDropzone: boolean }) {
  const { inputRef, uploading, error, upload, choose } = state;
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !uploading) void upload(file);
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
      {showDropzone ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-3 rounded-panel border border-dashed px-6 py-12 text-center",
            dragging ? "border-clay bg-clay-soft" : "border-stone-strong bg-stone-100",
          )}
        >
          <FileUp size={24} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ink">Drop a PDF here or choose a file</h2>
          <p className="max-w-prose text-ink-2">
            Notes, textbooks, slides or past papers. Text-based PDFs up to {MAX_UPLOAD_MB} MB. Once it shows Ready, you can ask questions about it or create a quiz.
          </p>
          <Button variant="secondary" onClick={choose} loading={uploading}>
            {uploading ? "Processing" : "Choose file"}
          </Button>
        </div>
      ) : null}
      <div id="upload-status" aria-live="polite" className={cn("text-sm", (uploading || error) && "mt-3")}>
        {uploading ? <p className="text-ink-2">Reading and indexing your document. Larger files take longer</p> : null}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
