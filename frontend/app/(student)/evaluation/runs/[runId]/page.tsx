import { Suspense } from "react";
import { RunPage } from "@/components/evaluation/run-page";

export const instant = false;
export const metadata = { title: "Evaluation run | EduRAG" };

export default function EvaluationRunPage() {
  return (
    <Suspense>
      <RunPage />
    </Suspense>
  );
}
