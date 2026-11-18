"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocumentStatusLabel } from "@/components/ui/status-label";
import { ApiError } from "@/lib/api-client";
import { documentsApi } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/formatters";
import type { StudyDocument } from "@/types/api";

type Props = { documents: StudyDocument[]; onDeleted: (id: string) => void };

export function DocumentList({ documents, onDeleted }: Props) {
  const [target, setTarget] = useState<StudyDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    setError(null);
    try {
      await documentsApi.remove(target.id);
      onDeleted(target.id);
      setTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the document. Please try again.");
      setTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-stone rounded-panel border border-stone bg-paper">
        {documents.map((doc) => (
          <li key={doc.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{doc.title}</p>
              <p className="mt-0.5 text-sm text-ink-2">
                Uploaded {formatDate(doc.created_at)}
                {doc.page_count ? ` · ${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}` : ""} · {formatBytes(doc.file_size)}
              </p>
              {doc.status === "failed" ? (
                <p className="mt-1 text-sm text-danger">{doc.error_message ?? "Processing failed."}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <DocumentStatusLabel status={doc.status} />
              <Button
                variant="secondary"
                onClick={() => setTarget(doc)}
                aria-label={`Delete ${doc.title}`}
                className="px-3"
              >
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        title="Delete this document"
        description={`"${target?.title ?? ""}" and its searchable text will be removed. Quizzes you already took stay in your history.`}
        confirmLabel={deleting ? "Deleting" : "Delete document"}
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
