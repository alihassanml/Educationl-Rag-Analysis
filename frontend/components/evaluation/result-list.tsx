import { cn } from "@/lib/cn";
import type { EvalOutcome, EvalResult } from "@/types/api";

function Verdict({ result }: { result: EvalResult }) {
  if (result.error) return <span className="text-sm font-medium text-warning">Not scored</span>;
  return result.passed ? (
    <span className="text-sm font-medium text-success">Passed</span>
  ) : (
    <span className="text-sm font-medium text-danger">Failed</span>
  );
}

function describe(result: EvalResult): string {
  if (!result.answerable) return "Not answerable from the material";
  const gold = `${result.gold_document_title}, page ${result.gold_page}`;
  const rank = result.first_relevant_rank ? `found at rank ${result.first_relevant_rank}` : "not found";
  return `Expected ${gold}, ${rank}`;
}

export function ResultList({
  results,
  total,
  filter,
  onFilterChange,
}: {
  results: EvalResult[];
  total: number;
  filter: EvalOutcome;
  onFilterChange: (filter: EvalOutcome) => void;
}) {
  const filters: { value: EvalOutcome; label: string }[] = [
    { value: "all", label: "All" },
    { value: "failed", label: "Failed" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Filter questions">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => onFilterChange(f.value)}
              className={cn(
                "h-9 rounded-control border px-3 text-sm font-medium",
                filter === f.value ? "border-clay bg-clay-soft text-accent-link" : "border-stone bg-paper text-ink-2 hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-2">
          Showing {results.length} of {total}
        </p>
      </div>

      {results.length === 0 ? (
        <p className="rounded-panel border border-dashed border-stone px-4 py-8 text-center text-ink-2">
          No questions match this filter
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((result) => (
            <li key={result.id} className="rounded-panel border border-stone bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{result.question}</p>
                <Verdict result={result} />
              </div>
              <p className="mt-1 text-sm text-ink-2">{describe(result)}</p>
              {result.error ? <p className="mt-2 text-sm text-warning">{result.error}</p> : null}
              {result.retrieved.length > 0 ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-accent-link">Retrieved passages</summary>
                  <ol className="mt-2 flex flex-col gap-1">
                    {result.retrieved.map((chunk) => (
                      <li key={chunk.chunk_id} className="flex flex-wrap items-center gap-x-3 text-ink-2">
                        <span className="w-6 tabular-nums">{chunk.rank}</span>
                        <span className="text-ink">
                          {chunk.document_title}, page {chunk.page_number ?? "not available"}
                        </span>
                        <span className="tabular-nums">{chunk.similarity.toFixed(2)}</span>
                        {chunk.relevant ? <span className="font-medium text-success">Gold passage</span> : null}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
