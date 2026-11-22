"use client";

import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";
import { classesApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";

/** The teacher's home: their classes, and a form to start a new one. */
export function TeacherView() {
  const { data, loading, error, reload } = useApi(classesApi.list);
  const toast = useToast();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setNameError("Use at least 2 characters");
      return;
    }
    setNameError(null);
    setCreating(true);
    try {
      const created = await classesApi.create(name.trim());
      toast.show(`Created ${created.name}`);
      setName("");
      reload();
    } catch (e) {
      setNameError(e instanceof ApiError ? e.message : "Could not create the class. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Your classes" description="Share material with a class and see which topics your students find hard" />
      <div className="flex max-w-3xl flex-col gap-6">
        <Panel title="New class">
          <form onSubmit={create} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <Field id="class-name" label="Class name" error={nameError ?? undefined}>
                <Input id="class-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-invalid={Boolean(nameError)} disabled={creating} />
              </Field>
            </div>
            <Button type="submit" loading={creating} className="sm:mt-7">
              Create class
            </Button>
          </form>
        </Panel>

        {loading && !data ? <LoadingBlock label="Loading your classes" /> : null}
        {error && !data ? <ErrorBlock message={error.message} onRetry={reload} /> : null}
        {data && data.length === 0 ? (
          <EmptyState title="No classes yet" icon={GraduationCap}>
            Create a class, share a document with it, and give your students the class code.
          </EmptyState>
        ) : null}
        {data && data.length > 0 ? (
          <ul aria-label="Your classes" className="flex flex-col gap-3">
            {data.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/teacher/${c.id}`}
                  className="flex flex-col gap-1 rounded-panel border border-stone bg-paper p-5 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <span className="text-base font-semibold text-ink">{c.name}</span>
                  <span className="text-small text-ink-2">
                    {c.member_count} {c.member_count === 1 ? "student" : "students"} · {c.document_count} shared {c.document_count === 1 ? "document" : "documents"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PageContainer>
  );
}
