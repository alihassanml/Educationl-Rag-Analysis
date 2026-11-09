"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { documentsApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { DocumentList } from "./document-list";
import { UploadPanel } from "./upload-panel";

export function LibraryView() {
  const { data, error, loading, reload } = useApi(documentsApi.list);

  return (
    <PageContainer>
      <PageHeader title="My Library" description="Your study documents. Answers and quizzes only use what you upload here." />
      <div className="flex flex-col gap-6">
        <UploadPanel onUploaded={reload} />
        {loading ? <LoadingBlock label="Loading your documents" /> : null}
        {error ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
        {data && data.items.length === 0 ? (
          <EmptyState title="No documents yet">
            Upload your first PDF above. Once it shows Ready, you can ask questions about it or create a quiz.
          </EmptyState>
        ) : null}
        {data && data.items.length > 0 ? <DocumentList documents={data.items} onDeleted={reload} /> : null}
      </div>
    </PageContainer>
  );
}
