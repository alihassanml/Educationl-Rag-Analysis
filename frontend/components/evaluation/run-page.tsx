"use client";

import { useParams } from "next/navigation";
import { RunView } from "./run-view";

export function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  return <RunView runId={runId} />;
}
