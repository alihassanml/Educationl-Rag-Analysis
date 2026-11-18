"use client";

import { FileUp } from "lucide-react";
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
  const upload = useUpload(() => reload());
  const empty = data !== null && data.items.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="My library"
        description="PDFs you upload are private to your account"
        action={
          <Button onClick={upload.choose} loading={upload.uploading}>
            {upload.uploading ? null : <FileUp size={16} strokeWidth={1.75} aria-hidden="true" />}
            Upload PDF
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <UploadPanel state={upload} showDropzone={empty} />
        {loading ? <LoadingBlock label="Loading your documents" /> : null}
        {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
        {data && data.items.length > 0 ? <DocumentList documents={data.items} onDeleted={reload} /> : null}
      </div>
    </PageContainer>
  );
}
