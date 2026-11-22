"use client";

import { useEffect } from "react";
import { documentsApi } from "./api";
import { useApi } from "./use-api";

/** How often to look again while a document is being indexed. */
export const POLL_MS = 2500;
/** Stop looking after this long, so a stuck document never keeps the page polling for ever. */
export const POLL_LIMIT_MS = 10 * 60 * 1000;

/** The student's documents. While any of them is still being indexed (the worker does that after
 *  the upload returns) the list is fetched again every few seconds, until each is ready or failed. */
export function useDocuments() {
  const documents = useApi(documentsApi.list);
  const { data, reload } = documents;
  const waiting = data?.items.some((d) => d.status === "processing" || d.status === "uploaded") ?? false;

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) window.clearInterval(timer);
      else reload();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, reload]);

  return { ...documents, waiting };
}
