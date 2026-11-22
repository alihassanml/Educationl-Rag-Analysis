"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { documentsApi } from "@/lib/api";
import { parseWebAddress, validateLink, validatePdf, validateText, validateYoutube } from "@/lib/validators";
import type { DocumentKind, DocumentMeta, StudyDocument } from "@/types/api";

/** One place for adding material, whichever way it arrives: a PDF file, a link (a web page or an
 *  online PDF) or pasted text. The page header button, the dropzone and the chat all share it. */
export function useUpload(onUploaded: (document: StudyDocument) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setErrorText] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const setError = (message: string | null, code: string | null = null) => {
    setErrorText(message);
    setErrorCode(code);
  };
  // What the student says this material is. Notes is the default, and is sent as nothing at all.
  const [kind, setKind] = useState<DocumentKind>("notes");
  const [examYear, setExamYear] = useState("");
  const [examSession, setExamSession] = useState("");

  function meta(): DocumentMeta | undefined {
    if (kind === "notes") return undefined;
    const year = Number(examYear);
    return {
      kind,
      ...(kind === "past_paper" && Number.isInteger(year) && year >= 1900 && year <= 2100 ? { exam_year: year } : {}),
      ...(kind === "past_paper" && examSession.trim() ? { exam_session: examSession.trim() } : {}),
    };
  }

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
      setError(e instanceof ApiError ? e.message : failure, e instanceof ApiError ? e.code : null);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function upload(file: File) {
    const added = await run(validatePdf(file), () => { const m = meta(); return m ? documentsApi.upload(file, m) : documentsApi.upload(file); }, "Upload failed. Please try again.");
    if (inputRef.current) inputRef.current.value = "";
    return added;
  }

  const addLink = (input: string, title?: string) =>
    run(
      validateLink(input),
      () => {
        const m = meta();
        return m ? documentsApi.addLink(parseWebAddress(input)!, title, m) : documentsApi.addLink(parseWebAddress(input)!, title);
      },
      "Could not add that link. Please try again.",
    );

  // The kind of a lecture video defaults to "lecture" on the server, unless the student chose another
  const addYoutube = (input: string) =>
    run(
      validateYoutube(input),
      () => {
        const m = meta();
        return m ? documentsApi.addYoutube(input.trim(), undefined, m) : documentsApi.addYoutube(input.trim());
      },
      "Could not add that video. Please try again.",
    );

  const addText = (title: string, text: string) =>
    run(
      validateText(title, text),
      () => {
        const m = meta();
        return m ? documentsApi.addText(title.trim(), text, m) : documentsApi.addText(title.trim(), text);
      },
      "Could not add that text. Please try again.",
    );

  return { inputRef, uploading, error, errorCode, setError, kind, setKind, examYear, setExamYear, examSession, setExamSession, upload, addLink, addYoutube, addText, choose: () => inputRef.current?.click() };
}

export type UploadState = ReturnType<typeof useUpload>;
