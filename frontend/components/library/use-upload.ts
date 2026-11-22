"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { documentsApi } from "@/lib/api";
import { parseWebAddress, validateLink, validatePdf, validateText } from "@/lib/validators";
import type { StudyDocument } from "@/types/api";

/** One place for adding material, whichever way it arrives: a PDF file, a link (a web page or an
 *  online PDF) or pasted text. The page header button, the dropzone and the chat all share it. */
export function useUpload(onUploaded: (document: StudyDocument) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(problem: string | null, add: () => Promise<StudyDocument>, failure: string): Promise<StudyDocument | null> {
    if (problem) {
      setError(problem);
      return null;
    }
    setError(null);
    setUploading(true);
    try {
      const document = await add();
      onUploaded(document);
      return document;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failure);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function upload(file: File) {
    const added = await run(validatePdf(file), () => documentsApi.upload(file), "Upload failed. Please try again.");
    if (inputRef.current) inputRef.current.value = "";
    return added;
  }

  const addLink = (input: string, title?: string) =>
    run(validateLink(input), () => documentsApi.addLink(parseWebAddress(input)!, title), "Could not add that link. Please try again.");

  const addText = (title: string, text: string) =>
    run(validateText(title, text), () => documentsApi.addText(title.trim(), text), "Could not add that text. Please try again.");

  return { inputRef, uploading, error, setError, upload, addLink, addText, choose: () => inputRef.current?.click() };
}

export type UploadState = ReturnType<typeof useUpload>;
