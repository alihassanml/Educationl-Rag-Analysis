import { formatPercent } from "@/lib/eval-format";
import type { EvalMetrics } from "@/types/api";

type Abstention = EvalMetrics["abstention"];

function Cell({ count, total, label }: { count: number; total: number; label: string }) {
  return (
    <td className="p-4 align-top">
      <span className="block text-2xl font-medium tabular-nums">{count}</span>
      <span className="block text-sm tabular-nums text-ink-2">{total > 0 ? formatPercent(count / total) : "0.0%"}</span>
      <span className="mt-1 block text-sm text-ink-2">{label}</span>
    </td>
  );
}

/** "Answerable" is the positive class: an answer to an unanswerable question is the
 *  hallucination risk, a refusal of an answerable one is over-cautious. */
export function ConfusionMatrix({ abstention }: { abstention: Abstention }) {
  const total = abstention.tp + abstention.fn + abstention.fp + abstention.tn;
  return (
    <div className="overflow-x-auto">
      <table aria-label="Abstention confusion matrix" className="w-full min-w-[28rem] border-collapse text-left">
        <thead>
          <tr className="text-sm text-ink-2">
            <td />
            <th scope="col" className="p-4 font-medium">
              System answered
            </th>
            <th scope="col" className="p-4 font-medium">
              System abstained
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-stone">
            <th scope="row" className="p-4 text-sm font-medium">
              Question is answerable
            </th>
            <Cell count={abstention.tp} total={total} label="Answered" />
            <Cell count={abstention.fn} total={total} label="Over-cautious refusal" />
          </tr>
          <tr className="border-t border-stone">
            <th scope="row" className="p-4 text-sm font-medium">
              Question is not answerable
            </th>
            <Cell count={abstention.fp} total={total} label="Answered anyway: hallucination risk" />
            <Cell count={abstention.tn} total={total} label="Correctly said it is not in the material" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
