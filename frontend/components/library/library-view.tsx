"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { documentsApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { DocumentList } from "./document-list";
import { UploadPanel } from "./upload-panel";
import { useUpload } from "./use-upload";

export function LibraryView() {
  const { data, error, loading, reload } = useApi(documentsApi.list);
  const [adding, setAdding] = useState(false);
  const upload = useUpload(() => {
    setAdding(false);
    reload();
  });
  const empty = data !== null && data.items.length === 0;
  // With no material yet the ways to add it are the page; afterwards they open from the button
  const showPanel = empty || adding;

  return (
    <PageContainer>
      <PageHeader
        title="My library"
        description="Everything here is private to your account"
        action={
          empty ? undefined : (
            <Button variant={adding ? "secondary" : "primary"} onClick={() => setAdding((open) => !open)} aria-expanded={adding}>
              {adding ? <X size={16} strokeWidth={1.75} aria-hidden="true" /> : <Plus size={16} strokeWidth={1.75} aria-hidden="true" />}
              {adding ? "Close" : "Add source"}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-6">
        <UploadPanel state={upload} showPanel={showPanel} />
        {loading ? <LoadingBlock label="Loading your documents" /> : null}
        {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
        {data && data.items.length > 0 ? <DocumentList documents={data.items} onDeleted={reload} /> : null}
      </div>
    </PageContainer>
  );
}
