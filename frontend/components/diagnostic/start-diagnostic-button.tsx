"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { diagnosticApi } from "@/lib/api";

/** Writes the diagnostic from the student's topics and opens it. Used on the dashboard, in Settings
 *  and on the Course Map, so the wording of the label changes but the behaviour does not. */
export function StartDiagnosticButton({ label = "Start your diagnostic", variant = "primary", size }: { label?: string; variant?: "primary" | "secondary"; size?: "sm" | "md" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const quiz = await diagnosticApi.start();
      router.push(`/quizzes/${quiz.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the diagnostic. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant={variant} size={size} onClick={() => void start()} loading={pending}>
        {pending ? "Writing your questions" : label}
      </Button>
      {error ? (
        <p role="alert" className="max-w-xs text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
