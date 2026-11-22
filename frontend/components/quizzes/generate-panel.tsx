"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ScopeSelector } from "@/components/tutor/scope-selector";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedTiles } from "@/components/ui/segmented-tiles";
import { ApiError } from "@/lib/api-client";
import { quizzesApi } from "@/lib/api";
import type { Difficulty, StudyDocument } from "@/types/api";

type Level = "auto" | Difficulty;

const DIFFICULTIES: { value: Level; label: string; description?: string }[] = [
  { value: "auto", label: "Automatic", description: "Follows your results on the topic" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/** The quiz form shown inside the "New quiz" dialog. Generation logic is unchanged. */
export function GeneratePanel({ documents, initialTopic = "", onCancel, onCreated }: { documents: StudyDocument[]; initialTopic?: string; onCancel: () => void; onCreated?: () => void }) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic);
  const [difficulty, setDifficulty] = useState<Level>("auto");
  const [count, setCount] = useState(5);
  const [scope, setScope] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const quiz = await quizzesApi.generate({
        topic: topic.trim() || undefined,
        document_ids: scope.length > 0 ? scope : undefined,
        // Only when the student picked a level themselves; otherwise the server decides
        ...(difficulty === "auto" ? {} : { difficulty }),
        num_questions: count,
      });
      onCreated?.(); // close the dialog before leaving the page
      router.push(`/quizzes/${quiz.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the quiz. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field id="topic" label="Topic" hint="Optional. Leave blank to be quizzed on a mix of your material">
        <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="For example: Recursion" disabled={pending} aria-describedby="topic-hint" />
      </Field>
      <SegmentedTiles name="difficulty" legend="Difficulty (choose a level to override the automatic one)" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} disabled={pending} />
      <Field id="count" label="Number of questions">
        <Select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={pending}>
          {[3, 5, 8, 10].map((n) => (
            <option key={n} value={n}>
              {n} questions
            </option>
          ))}
        </Select>
      </Field>
      <ScopeSelector documents={documents} selected={scope} onChange={setScope} disabled={pending} />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {pending ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-sm text-ink-2">Writing questions from your material</p>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Creating" : "Create quiz"}
        </Button>
      </div>
    </form>
  );
}
