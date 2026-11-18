"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { ErrorBlock, Spinner } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ApiError } from "@/lib/api-client";
import { evalApi } from "@/lib/api";
import { formatDelta, formatLatency, formatPercent, modeLabel, type Delta } from "@/lib/eval-format";
import { formatDateTime } from "@/lib/formatters";
import type { EvalCompare, EvalMetrics, EvalRun } from "@/types/api";

const CONFIG_LABELS: Record<string, string> = {
  retrieval_mode: "Retrieval mode",
  min_similarity: "Similarity threshold",
  depth: "Ranking depth",
  embedding_model: "Embedding model",
};

type Row = { label: string; a: string; b: string; delta: Delta | null };

function rows(a: EvalMetrics, b: EvalMetrics): Row[] {
  const percent = (label: string, x: number, y: number): Row => ({
    label,
    a: formatPercent(x),
    b: formatPercent(y),
    delta: formatDelta(x, y),
  });
  return [
    percent("Hit rate at 1", a.hit_rate["1"], b.hit_rate["1"]),
    percent("Hit rate at 3", a.hit_rate["3"], b.hit_rate["3"]),
    percent("Hit rate at 5", a.hit_rate["5"], b.hit_rate["5"]),
    percent("Hit rate at 10", a.hit_rate["10"], b.hit_rate["10"]),
    { label: "MRR", a: a.mrr.toFixed(3), b: b.mrr.toFixed(3), delta: formatDelta(a.mrr, b.mrr, "abs") },
    percent("nDCG at 5", a.ndcg["5"], b.ndcg["5"]),
    percent("Abstention F1", a.abstention.f1, b.abstention.f1),
    { label: "p95 latency", a: formatLatency(a.latency_ms.p95), b: formatLatency(b.latency_ms.p95), delta: null },
  ];
}

function runLabel(run: EvalRun): string {
  return `${run.dataset_name}, ${modeLabel(run.config.retrieval_mode).toLowerCase()}, ${formatDateTime(run.created_at)}`;
}

export function ComparePanel({ runs }: { runs: EvalRun[] }) {
  // null means "not chosen yet": follow the list as runs finish, so the defaults stay valid.
  const [chosenA, setA] = useState<string | null>(null);
  const [chosenB, setB] = useState<string | null>(null);
  const has = (id: string | null): id is string => id !== null && runs.some((r) => r.id === id);
  const a = has(chosenA) ? chosenA : (runs[0]?.id ?? "");
  const b = has(chosenB) ? chosenB : (runs.find((r) => r.id !== a)?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvalCompare | null>(null);

  if (runs.length < 2) {
    return (
      <Panel title="Compare runs">
        <p className="text-ink-2">Complete two runs to compare them</p>
      </Panel>
    );
  }

  async function compare() {
    setError(null);
    setPending(true);
    try {
      setResult(await evalApi.compare([a, b]));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not compare these runs. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const [first, second] = result?.runs ?? [];
  const options = runs.map((run) => (
    <option key={run.id} value={run.id}>
      {runLabel(run)}
    </option>
  ));

  return (
    <Panel title="Compare runs">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="compare-a" label="Run A">
            <Select id="compare-a" value={a} onChange={(e) => setA(e.target.value)}>
              {options}
            </Select>
          </Field>
          <Field id="compare-b" label="Run B">
            <Select id="compare-b" value={b} onChange={(e) => setB(e.target.value)}>
              {options}
            </Select>
          </Field>
        </div>
        <div>
          <Button variant="secondary" onClick={compare} disabled={pending || a === b}>
            {pending ? <Spinner /> : null}
            Compare
          </Button>
        </div>
        {error ? <ErrorBlock message={error} onRetry={compare} /> : null}

        {first?.metrics && second?.metrics ? (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Metrics of the two runs and the change from A to B</caption>
                <thead>
                  <tr className="border-b border-stone text-ink-2">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Metric
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      A
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      B
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows(first.metrics, second.metrics).map((row) => (
                    <tr key={row.label} className="border-b border-stone last:border-0">
                      <th scope="row" className="py-2 pr-4 font-normal">
                        {row.label}
                      </th>
                      <td className="py-2 pr-4">{row.a}</td>
                      <td className="py-2 pr-4">{row.b}</td>
                      <td className="py-2">{row.delta ? row.delta.text : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-medium">What differed between the runs</h3>
              {Object.keys(result?.config_diff ?? {}).length === 0 ? (
                <p className="text-sm text-ink-2">The settings were identical</p>
              ) : (
                <ul className="mt-1 text-sm text-ink-2">
                  {Object.entries(result?.config_diff ?? {}).map(([key, values]) => (
                    <li key={key}>
                      <span className="text-ink">{CONFIG_LABELS[key] ?? key}</span>:{" "}
                      {values.map(String).join(" → ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
