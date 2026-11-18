"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { documentsApi } from "@/lib/api";
import { validatePdf } from "@/lib/validators";
import type { StudyDocument } from "@/types/api";

/** Upload state shared by the page header button and the dropzone. Validation and API calls are unchanged. */
export function useUpload(onUploaded: (document: StudyDocument) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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

  return { inputRef, uploading, error, upload, choose: () => inputRef.current?.click() };
}

export type UploadState = ReturnType<typeof useUpload>;
