"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/field";
import { EmptyState, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { TopicStatusLabel } from "@/components/ui/status-label";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";
import { classesApi, documentsApi, teacherApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { ClassDetail, ClassInsights } from "@/types/api";

function Insights({ insights }: { insights: ClassInsights }) {
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Topics the class finds hard">
        {insights.topics.length > 0 ? (
          <ul className="divide-y divide-stone" aria-label="Class topics, weakest first">
            {insights.topics.map((t) => (
              <li key={t.topic} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-sm font-medium text-ink">{t.topic}</span>
                <span className="flex items-center gap-3 text-small text-ink-2">
                  {t.students} students · {t.accuracy}% correct
                  <TopicStatusLabel status={t.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">
            A topic is listed once at least {insights.min_students} students have practised it, so a figure is never one or two students&apos; scores.
            {insights.topics_hidden > 0 ? ` ${insights.topics_hidden} ${insights.topics_hidden === 1 ? "topic is" : "topics are"} waiting for more students.` : ""}
          </p>
        )}
      </Panel>
      <Panel title="Students">
        {insights.students.length === 0 ? (
          <p className="text-sm text-ink-2">Nobody has joined yet. Share the class code.</p>
        ) : (
          <ul className="divide-y divide-stone" aria-label="Students">
            {insights.students.map((s) => (
              <li key={s.student_id} className="py-3">
                <p className="text-sm font-medium text-ink">{s.display_name}</p>
                {s.topics.length === 0 ? (
                  <p className="text-small text-ink-2">No quiz results yet</p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {s.topics.map((t) => (
                      <li key={t.topic} className="flex flex-wrap items-center justify-between gap-2 text-small text-ink-2">
                        <span className="text-ink">{t.topic}</span>
                        <span className="flex items-center gap-2">
                          {t.accuracy ?? 0}% · {t.level}
                          <TopicStatusLabel status={t.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-small text-ink-2">You see topic progress for your own students only. Their documents and chats are private.</p>
      </Panel>
    </div>
  );
}

export function ClassManager({ classId }: { classId: string }) {
  const router = useRouter();
  const toast = useToast();
  const detail = useApi<ClassDetail>((signal) => classesApi.get(classId, signal));
  const insights = useApi<ClassInsights>((signal) => teacherApi.insights(classId, signal));
  const library = useApi((signal) => documentsApi.list(signal));
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.show(done);
      detail.reload();
      insights.reload();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.show("Code copied");
    } catch {
      toast.show("Select the code and copy it");
    }
  }

  if (detail.loading && !detail.data) {
    return (
      <PageContainer>
        <LoadingBlock label="Loading the class" />
      </PageContainer>
    );
  }
  if (!detail.data) {
    return (
      <PageContainer>
        <ErrorBlock message={detail.error?.message ?? "Class not found"} onRetry={detail.reload} />
      </PageContainer>
    );
  }
  const c = detail.data;
  const sharedIds = new Set(c.documents.map((d) => d.id));
  const options = (library.data?.items ?? []).filter((d) => d.status === "ready" && !sharedIds.has(d.id));

  return (
    <PageContainer>
      <PageHeader
        title={c.name}
        action={
          <>
            <ButtonLink href="/teacher" variant="secondary" size="sm">
              All classes
            </ButtonLink>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete class
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Panel title="Class code">
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-control bg-stone-100 px-3 py-2 font-mono text-lg tracking-widest text-ink" aria-label="Class code">
              {c.join_code}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copyCode(c.join_code ?? "")}>
              Copy code
            </Button>
          </div>
          <p className="mt-2 text-small text-ink-2">Students join from My classes with this code.</p>
        </Panel>

        <Panel title="Shared material">
          {c.documents.length === 0 ? (
            <p className="mb-3 text-sm text-ink-2">Nothing shared yet. Students can search shared documents with their own material.</p>
          ) : (
            <ul className="mb-4 divide-y divide-stone" aria-label="Shared documents">
              {c.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-sm text-ink">{d.title}</span>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(() => classesApi.unshare(c.id, d.id), `Stopped sharing ${d.title}`)}>
                    Stop sharing
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {options.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select aria-label="Document to share" value={pick} onChange={(e) => setPick(e.target.value)} className="h-9">
                <option value="">Choose a document</option>
                {options.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
              <Button disabled={!pick || busy} onClick={() => void run(() => classesApi.share(c.id, pick).then(() => setPick("")), "Shared with the class")}>
                Share
              </Button>
            </div>
          ) : (
            <EmptyState title="No document to share">
              Upload a document first. <ButtonLink href="/library" variant="secondary" size="sm" className="ml-1">My library</ButtonLink>
            </EmptyState>
          )}
        </Panel>

        <Panel title={`Members (${c.members.length})`}>
          {c.members.length === 0 ? (
            <p className="text-sm text-ink-2">Nobody has joined yet.</p>
          ) : (
            <ul className="divide-y divide-stone" aria-label="Members">
              {c.members.map((m) => (
                <li key={m.student_id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm text-ink">{m.display_name}</span>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(() => classesApi.removeMember(c.id, m.student_id), `Removed ${m.display_name}`)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {insights.loading && !insights.data ? <LoadingBlock label="Loading class progress" /> : null}
        {insights.error && !insights.data ? <ErrorBlock message={insights.error.message} onRetry={insights.reload} /> : null}
        {insights.data ? <Insights insights={insights.data} /> : null}
        <Notice>Students see your name and the shared documents. Shared documents are read-only for them.</Notice>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${c.name}?`}
        description="Students lose access to its shared material. Your documents are not deleted."
        confirmLabel="Delete class"
        pending={busy}
        onConfirm={() => {
          setBusy(true);
          classesApi
            .remove(c.id)
            .then(() => {
              toast.show("Class deleted");
              router.replace("/teacher");
            })
            .catch((e: unknown) => {
              toast.show(e instanceof ApiError ? e.message : "Could not delete the class");
              setBusy(false);
              setConfirmDelete(false);
            });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </PageContainer>
  );
}
