import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Section, SectionHeading } from "./section";

type Cell = "yes" | "no" | "varies";

const COLUMNS = ["EduRAG", "General AI chatbots", "Notes Q&A tools", "Quiz and flashcard apps"] as const;

// Category comparison, no brand names. EduRAG gets a tick only for live features. Competitor cells are
// the owner's wording from the brief and default to "Varies" unless the team has verified them.
const ROWS: { feature: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  { feature: "Answers only from your own files", cells: ["yes", "no", "yes", "no"] },
  { feature: "Cites document and page", cells: ["yes", "varies", "varies", "no"] },
  { feature: "Says when your notes don’t cover it", cells: ["yes", "varies", "varies", "no"] },
  { feature: "Quizzes generated from your files", cells: ["yes", "varies", "varies", "varies"] },
  { feature: "Weak topics and a next step from your results", cells: ["yes", "no", "no", "varies"] },
  { feature: "Accuracy measured on a labelled test set", cells: ["yes", "no", "no", "no"] },
];

function Mark({ cell }: { cell: Cell }) {
  if (cell === "yes") {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Check size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">Yes</span>
      </span>
    );
  }
  if (cell === "no") {
    return (
      <span className="inline-flex items-center text-ink-3">
        <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">No</span>
      </span>
    );
  }
  return <span className="text-small text-ink-2">Varies</span>;
}

export function Comparison() {
  return (
    <Section id="why" tone="muted">
      <SectionHeading title="One study loop instead of four separate tools" lead="General chatbots don’t use your syllabus, notes tools don’t run quizzes, and quiz apps don’t build from your files" />

      <div className="hidden overflow-hidden rounded-panel border border-stone bg-paper md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">How EduRAG compares with other kinds of study tools</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[34%] p-4 text-left font-medium text-ink-2">
                <span className="sr-only">Capability</span>
              </th>
              {COLUMNS.map((column, i) => (
                <th key={column} scope="col" className={cn("p-4 text-left font-semibold text-ink", i === 0 && "border-t-2 border-clay bg-clay-soft")}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.feature} className="border-t border-stone">
                <th scope="row" className="p-4 text-left font-normal text-ink">
                  {row.feature}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={COLUMNS[i]} className={cn("p-4", i === 0 && "bg-clay-soft")}>
                    <Mark cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below 768px: one card per row, EduRAG first */}
      <ul className="flex flex-col gap-4 md:hidden">
        {ROWS.map((row) => (
          <li key={row.feature} className="rounded-panel border border-stone bg-paper p-4">
            <p className="font-medium text-ink">{row.feature}</p>
            <dl className="mt-3 flex flex-col gap-2">
              {row.cells.map((cell, i) => (
                <div key={COLUMNS[i]} className={cn("flex items-center justify-between rounded-control px-3 py-2", i === 0 && "border-t-2 border-clay bg-clay-soft")}>
                  <dt className={cn("text-small", i === 0 ? "font-semibold text-ink" : "text-ink-2")}>{COLUMNS[i]}</dt>
                  <dd>
                    <Mark cell={cell} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </Section>
  );
}
