"use client";

import { AlignLeft, FileText, Globe, ListChecks, MessageCircleQuestion, Trash2, Type, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { DocumentStatusLabel } from "@/components/ui/status-label";
import { tableBase, tableFrame, tableHead, td, th, tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";
import { documentsApi } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/formatters";
import { formatRelative } from "@/lib/relative-time";
import type { DocumentSource, StudyDocument } from "@/types/api";

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

export const SOURCE: Record<DocumentSource, { icon: LucideIcon; label: string; retry: string }> = {
  pdf: { icon: FileText, label: "PDF", retry: "Upload a text-based PDF" },
  website: { icon: Globe, label: "Web page", retry: "Check the address or add it again" },
  text: { icon: Type, label: "Pasted text", retry: "Add the text again" },
};

function SourceIcon({ doc }: { doc: StudyDocument }) {
  const { icon: Icon, label } = SOURCE[doc.source_type ?? "pdf"];
  return (
    <span title={label} className="shrink-0 text-ink-2">
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A ready document's title opens a chat about it; any other title is plain text. */
function Title({ doc, className }: { doc: StudyDocument; className?: string }) {
  if (doc.status !== "ready") return <span className={className} title={doc.title}>{doc.title}</span>;
  return (
    <Link href={`/tutor?doc=${doc.id}`} title={`Ask about ${doc.title}`} className={`${className ?? ""} hover:text-accent-link hover:underline underline-offset-4`}>
      {doc.title}
    </Link>
  );
}

function FailureNote({ doc }: { doc: StudyDocument }) {
  if (doc.status !== "failed") return null;
  return (
    <p className="mt-1 text-small text-danger">
      {doc.error_message ?? "Processing failed."} {SOURCE[doc.source_type ?? "pdf"].retry}
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
      ...(doc.status === "ready"
        ? [
            { label: "Open in tutor", icon: MessageCircleQuestion, href: `/tutor?doc=${doc.id}` },
            { label: "Summarise", icon: AlignLeft, href: `/tutor?mode=summary&doc=${doc.id}` },
            { label: "Quiz me", icon: ListChecks, href: `/tutor?mode=quiz&doc=${doc.id}` },
          ]
        : []),
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

      <div className={tableFrame}>
        <table className={`${tableBase} table-fixed`}>
          <caption className="sr-only">Your uploaded documents</caption>
          {/* The title is what a student scans for, so it gets the room */}
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-14" />
          </colgroup>
          <thead className={tableHead}>
            <tr>
              <th scope="col" className={th}>Title</th>
              <th scope="col" className={th}>Type</th>
              <th scope="col" className={th}>Pages</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Added</th>
              <th scope="col" className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className={`${tr} hover:bg-stone-50`}>
                <td className={td}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SourceIcon doc={doc} />
                    <Title doc={doc} className="truncate font-medium text-ink" />
                  </div>
                  <FailureNote doc={doc} />
                </td>
                <td className={`${td} text-ink-2`}>{SOURCE[doc.source_type ?? "pdf"].label}</td>
                <td className={`${td} text-ink-2`}>{pagesText(doc)}</td>
                <td className={td}>
                  <DocumentStatusLabel status={doc.status} />
                </td>
                <td className={`${td} text-ink-2`}>
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
              <p className="flex min-w-0 items-center gap-2 break-words font-medium text-ink">
                <SourceIcon doc={doc} />
                <Title doc={doc} />
              </p>
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
