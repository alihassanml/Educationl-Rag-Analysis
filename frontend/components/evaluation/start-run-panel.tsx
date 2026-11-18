"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ApiError } from "@/lib/api-client";
import { evalApi } from "@/lib/api";
import type { EvalDataset, EvalMode, EvalRun } from "@/types/api";

export function StartRunPanel({
  datasets,
  onStarted,
}: {
  datasets: EvalDataset[];
  onStarted: (run: EvalRun) => void;
}) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [mode, setMode] = useState<EvalMode>("dense");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (datasets.length === 0) {
    return (
      <Panel title="New run">
        <p className="text-ink-2">
          There is no question set yet. Create one for your account with{" "}
          <code className="rounded-control bg-stone-100 px-1.5 py-0.5 text-sm">python -m eval.seed_lab --email you@example.com</code>{" "}
          from the backend folder.
        </p>
      </Panel>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      onStarted(await evalApi.startRun({ dataset_id: datasetId || datasets[0].id, retrieval_mode: mode }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the run. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel title="New run">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="eval-dataset" label="Question set">
            <Select id="eval-dataset" value={datasetId || datasets[0].id} onChange={(e) => setDatasetId(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.item_count} questions)
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="eval-mode"
            label="Retrieval mode"
            hint="Dense uses vector search. Hybrid also uses keyword search."
          >
            <Select id="eval-mode" value={mode} onChange={(e) => setMode(e.target.value as EvalMode)}>
              <option value="dense">Dense</option>
              <option value="hybrid">Hybrid</option>
            </Select>
          </Field>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Start run
          </Button>
        </div>
      </form>
    </Panel>
  );
}
