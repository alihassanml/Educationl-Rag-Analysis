"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { quizzesApi } from "@/lib/api";
import type { AttemptResult } from "@/types/api";
import { nextQuizLabel } from "./level-change";

/** Creates the next quiz on the same topic at the level the result earned, then opens it. */
export function NextQuizButton({ result, variant = "primary" }: { result: AttemptResult; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = nextQuizLabel(result.level_change);

  // A quiz with no topic has no level to carry on from
  if (!result.topic || !result.next_difficulty) {
    return (
      <Button variant={variant} onClick={() => router.push("/tutor?mode=quiz")}>
        {label}
      </Button>
    );
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      const quiz = await quizzesApi.generate({
        topic: result.topic ?? undefined,
        difficulty: result.next_difficulty ?? undefined,
        num_questions: result.total_questions,
      });
      router.push(`/quizzes/${quiz.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the quiz. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant={variant} onClick={() => void start()} loading={pending}>
        {pending ? "Writing questions" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
