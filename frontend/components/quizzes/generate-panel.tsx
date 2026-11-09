"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ScopeSelector } from "@/components/tutor/scope-selector";
import { ApiError } from "@/lib/api-client";
import { quizzesApi } from "@/lib/api";
import type { Difficulty, StudyDocument } from "@/types/api";

export function GeneratePanel({ documents }: { documents: StudyDocument[] }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
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
        difficulty,
        num_questions: count,
      });
      router.push(`/quizzes/${quiz.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the quiz. Please try again.");
      setPending(false);
    }
  }

  return (
    <Panel title="Create a quiz">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="topic" label="Topic" hint="Optional. Leave blank to be quizzed on a mix of your material.">
          <Input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={120}
            placeholder="For example: Recursion"
            disabled={pending}
            aria-describedby="topic-hint"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="difficulty" label="Difficulty">
            <Select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} disabled={pending}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </Field>
          <Field id="count" label="Number of questions">
            <Select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={pending}>
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <ScopeSelector documents={documents} selected={scope} onChange={setScope} disabled={pending} />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-4">
          {pending ? <p className="text-sm text-muted">Writing questions from your material. This can take a few seconds.</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? "Creating" : "Create quiz"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
