"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { SearchInput } from "@/components/ui/search-input";
import { useDocuments } from "@/lib/use-documents";
import { KINDS } from "@/lib/document-kinds";
import type { DocumentKind, DocumentSource, StudyDocument } from "@/types/api";
import { DocumentList, SOURCE } from "./document-list";
import { UploadPanel } from "./upload-panel";
import { useUpload } from "./use-upload";

type TypeFilter = DocumentSource | "all";

type KindFilter = DocumentKind | "all";

export function filterDocuments(docs: StudyDocument[], query: string, type: TypeFilter, kind: KindFilter = "all"): StudyDocument[] {
  const q = query.trim().toLowerCase();
  return docs.filter(
    (d) => (type === "all" || (d.source_type ?? "pdf") === type) && (kind === "all" || (d.kind ?? "notes") === kind) && (!q || d.title.toLowerCase().includes(q)),
  );
}

function Toolbar({ docs, query, setQuery, type, setType, kind, setKind, shown }: { docs: StudyDocument[]; query: string; setQuery: (q: string) => void; type: TypeFilter; setType: (t: TypeFilter) => void; kind: KindFilter; setKind: (k: KindFilter) => void; shown: number }) {
  const kinds = [...new Set(docs.map((d) => d.kind ?? "notes"))];
  // The type filter only earns its place when the library mixes kinds of material
  const types = [...new Set(docs.map((d) => d.source_type ?? "pdf"))];
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchInput value={query} onChange={setQuery} label="Search documents" className="w-full sm:max-w-xs" />
      {types.length > 1 ? (
        <select
          aria-label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as TypeFilter)}
          className="h-9 rounded-full border border-stone bg-paper pl-3 pr-8 text-sm text-ink focus-visible:border-accent-link"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {SOURCE[t].label}
            </option>
          ))}
        </select>
      ) : null}
      {kinds.length > 1 ? (
        <select
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          className="h-9 rounded-full border border-stone bg-paper pl-3 pr-8 text-sm text-ink focus-visible:border-accent-link"
        >
          <option value="all">All kinds</option>
          {KINDS.filter((k) => kinds.includes(k.value)).map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      ) : null}
      <p className="text-small text-ink-2 sm:ml-auto" aria-live="polite">
        {shown === docs.length ? `${docs.length} ${docs.length === 1 ? "document" : "documents"}` : `${shown} of ${docs.length} documents`}
      </p>
    </div>
  );
}

export function LibraryView() {
  const { data, error, loading, reload, waiting } = useDocuments();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const upload = useUpload(() => {
    setAdding(false);
    reload();
  });
  const docs = data?.items ?? [];
  const empty = data !== null && docs.length === 0;
  // With no material yet the ways to add it are the page; afterwards they open from the button
  const showPanel = empty || adding;
  const shown = filterDocuments(docs, query, type, kind);

  return (
    <PageContainer>
      <PageHeader
        title="My library"
        action={
          empty ? undefined : (
            <Button variant={adding ? "secondary" : "primary"} onClick={() => setAdding((open) => !open)} aria-expanded={adding}>
              {adding ? "Close" : "Add source"}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4">
        <UploadPanel state={upload} showPanel={showPanel} />
        {loading ? <LoadingBlock label="Loading your documents" /> : null}
        {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
        {waiting ? (
          <p role="status" className="text-small text-ink-2">
            Indexing your material in the background. This page updates by itself when it is ready
          </p>
        ) : null}
        {docs.length > 0 ? (
          <>
            <Toolbar docs={docs} query={query} setQuery={setQuery} type={type} setType={setType} kind={kind} setKind={setKind} shown={shown.length} />
            {shown.length > 0 ? (
              <DocumentList documents={shown} onDeleted={reload} onChanged={reload} />
            ) : (
              <p className="rounded-panel border border-dashed border-stone-strong/40 px-6 py-8 text-center text-sm text-ink-2">
                No documents match{query.trim() ? ` “${query.trim()}”` : " this filter"}.{" "}
                <button
                  type="button"
                  className="font-medium text-accent-link underline-offset-4 hover:underline"
                  onClick={() => {
                    setQuery("");
                    setType("all");
                    setKind("all");
                  }}
                >
                  Clear filters
                </button>
              </p>
            )}
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
