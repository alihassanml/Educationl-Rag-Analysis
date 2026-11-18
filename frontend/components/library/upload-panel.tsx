"use client";

import { FileUp } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ApiError } from "@/lib/api-client";
import { documentsApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MAX_UPLOAD_MB, validatePdf } from "@/lib/validators";
import type { StudyDocument } from "@/types/api";

type Props = { onUploaded: (document: StudyDocument) => void };

export function UploadPanel({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    const problem = validatePdf(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      onUploaded(await documentsApi.upload(file));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !uploading) void upload(file);
  }

  return (
    <Panel>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-start gap-4 rounded-control border border-dashed p-5 sm:flex-row sm:items-center",
          dragging ? "border-clay bg-clay-soft" : "border-stone",
        )}
      >
        <FileUp size={24} className="shrink-0 text-ink-2" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium">Upload a PDF</p>
          <p className="text-sm text-ink-2">
            Notes, textbooks, slides, or past papers. Text-based PDFs up to {MAX_UPLOAD_MB} MB. You can also drop a file here.
          </p>
        </div>
        <input
          ref={inputRef}
          id="pdf-upload"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading} aria-describedby="upload-status">
          {uploading ? <Spinner /> : null}
          {uploading ? "Processing" : "Choose PDF"}
        </Button>
      </div>
      <div id="upload-status" aria-live="polite" className="mt-3 text-sm">
        {uploading ? <p className="text-ink-2">Reading and indexing your document. Larger files take longer.</p> : null}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
