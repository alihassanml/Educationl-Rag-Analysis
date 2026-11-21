"use client";

import { MessageCircleQuestion, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { DocumentStatusLabel } from "@/components/ui/status-label";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";
import { documentsApi } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/formatters";
import { formatRelative } from "@/lib/relative-time";
import type { StudyDocument } from "@/types/api";

type Props = { documents: StudyDocument[]; onDeleted: (id: string) => void };

function pagesText(doc: StudyDocument): string {
  return doc.page_count ? `${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}` : "—";
}

function Uploaded({ doc }: { doc: StudyDocument }) {
  return (
    <time dateTime={doc.created_at} title={formatDate(doc.created_at)}>
      {formatRelative(doc.created_at)}
    </time>
  );
}

function FailureNote({ doc }: { doc: StudyDocument }) {
  if (doc.status !== "failed") return null;
  return (
    <p className="mt-1 text-small text-danger">
      {doc.error_message ?? "Processing failed."} Upload a text-based PDF
    </p>
  );
}

export function DocumentList({ documents, onDeleted }: Props) {
  const toast = useToast();
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
      toast.show("Document deleted");
      setTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the document. Please try again.");
      setTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function menuFor(doc: StudyDocument): MenuItem[] {
    return [
      ...(doc.status === "ready" ? [{ label: "Open in tutor", icon: MessageCircleQuestion, href: `/tutor?doc=${doc.id}` }] : []),
      { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTarget(doc) },
    ];
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="hidden overflow-hidden rounded-panel border border-stone bg-paper sm:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">Your uploaded documents</caption>
          {/* The title is what a student scans for, so it gets the room */}
          <colgroup>
            <col className="w-[44%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[20%]" />
            <col className="w-16" />
          </colgroup>
          <thead className="bg-stone text-left text-ink">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Title</th>
              <th scope="col" className="px-4 py-3 font-medium">Pages</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Uploaded</th>
              <th scope="col" className="w-14 px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="h-12 border-t border-stone align-middle">
                <td className="px-4 py-2">
                  <p className="truncate font-medium text-ink" title={doc.title}>
                    {doc.title}
                  </p>
                  <FailureNote doc={doc} />
                </td>
                <td className="px-4 py-2 text-ink-2">{pagesText(doc)}</td>
                <td className="px-4 py-2">
                  <DocumentStatusLabel status={doc.status} />
                </td>
                <td className="px-4 py-2 text-ink-2">
                  <Uploaded doc={doc} />
                </td>
                <td className="px-2 py-2 text-right">
                  <Menu label={`Actions for ${doc.title}`} items={menuFor(doc)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below 640px the table becomes stacked cards */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {documents.map((doc) => (
          <li key={doc.id} className="rounded-panel border border-stone bg-paper p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words font-medium text-ink">{doc.title}</p>
              <Menu label={`Actions for ${doc.title}`} items={menuFor(doc)} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
              <DocumentStatusLabel status={doc.status} />
              <span>{pagesText(doc)}</span>
              <span>{formatBytes(doc.file_size)}</span>
              <Uploaded doc={doc} />
            </div>
            <FailureNote doc={doc} />
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={target !== null}
        title={`Delete ${target?.title ?? "this document"}?`}
        description="Its passages will be removed from your knowledge base, so the tutor and new quizzes can no longer use it. Quizzes you already took stay in your history."
        confirmLabel="Delete document"
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
