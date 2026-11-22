"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { quizzesApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

/** Saves the quiz's questions, correct answers, explanations and sources as a PDF the student can keep. */
export function DownloadNotesButton({ quizId }: { quizId: string }) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const { blob, filename } = await quizzesApi.notesPdf(quizId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.show("Notes downloaded");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The notes could not be downloaded. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" loading={pending} onClick={() => void download()}>
        Download notes (PDF)
      </Button>
      {error ? (
        <p role="alert" className="basis-full text-small text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
