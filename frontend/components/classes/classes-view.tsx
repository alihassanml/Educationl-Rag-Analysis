"use client";

import { useState, type FormEvent } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";
import { classesApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { ClassDetail, ClassSummary } from "@/types/api";

function SharedDocuments({ id }: { id: string }) {
  const { data, loading, error, reload } = useApi<ClassDetail>((signal) => classesApi.get(id, signal));
  if (loading && !data) return <LoadingBlock label="Loading shared material" />;
  if (error && !data) return <ErrorBlock message={error.message} onRetry={reload} />;
  if (!data) return null;
  if (data.documents.length === 0) return <p className="text-sm text-ink-2">Your teacher has not shared any material yet.</p>;
  return (
    <ul className="divide-y divide-stone" aria-label={`Material shared in ${data.name}`}>
      {data.documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <span className="truncate">{doc.title}</span>
          </span>
          {doc.status !== "ready" ? <Chip tone="warning">Not ready yet</Chip> : null}
        </li>
      ))}
    </ul>
  );
}

/** The student's side: join a class with its code and see what the teacher shared. */
export function ClassesView() {
  const { data, loading, error, reload } = useApi(classesApi.list);
  const toast = useToast();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<ClassSummary | null>(null);
  const [leavePending, setLeavePending] = useState(false);

  async function join(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 8) {
      setJoinError("A class code has 8 characters");
      return;
    }
    setJoinError(null);
    setJoining(true);
    try {
      const joined = await classesApi.join(trimmed);
      toast.show(`Joined ${joined.name}`);
      setCode("");
      reload();
    } catch (e) {
      setJoinError(e instanceof ApiError && e.status === 404 ? "No class has that code. Check it with your teacher" : e instanceof ApiError ? e.message : "Could not join. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    if (!leaving) return;
    setLeavePending(true);
    try {
      await classesApi.leave(leaving.id);
      toast.show(`Left ${leaving.name}`);
      setLeaving(null);
      reload();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not leave the class");
    } finally {
      setLeavePending(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="My classes" />
      <div className="flex flex-col gap-4">
        <Panel title="Join a class">
          <form onSubmit={join} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <Field id="join-code" label="Class code" error={joinError ?? undefined} hint="Your teacher gives you an 8-character code">
                <Input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(joinError)}
                  disabled={joining}
                  className="font-mono tracking-widest"
                />
              </Field>
            </div>
            <Button type="submit" loading={joining} className="sm:mt-7">
              Join class
            </Button>
          </form>
          <p className="mt-3 text-small text-ink-2">Your teacher can see your progress on each topic, and your display name. They cannot see your documents or chats.</p>
        </Panel>

        {loading && !data ? <LoadingBlock label="Loading your classes" /> : null}
        {error && !data ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
        {data && data.length === 0 ? (
          <EmptyState title="You have not joined a class">
            Ask your teacher for the class code.
          </EmptyState>
        ) : null}
        {data?.map((c) => (
          <Panel
            key={c.id}
            title={c.name}
            action={
              <Button variant="secondary" size="sm" onClick={() => setLeaving(c)}>
                Leave class
              </Button>
            }
          >
            <p className="mb-3 text-small text-ink-2">
              Taught by {c.teacher_name} · {c.member_count} {c.member_count === 1 ? "student" : "students"}
            </p>
            <SharedDocuments id={c.id} />
          </Panel>
        ))}
        {data && data.length > 0 ? <Notice>Answers that use shared material say so, and cite its document and page.</Notice> : null}
      </div>
      <ConfirmDialog
        open={leaving !== null}
        title={`Leave ${leaving?.name ?? "this class"}?`}
        description="You will no longer be able to use its shared material. You can join again with the code."
        confirmLabel="Leave class"
        pending={leavePending}
        onConfirm={() => void leave()}
        onCancel={() => setLeaving(null)}
      />
    </PageContainer>
  );
}
