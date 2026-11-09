"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { EvalPerK } from "@/types/api";

const KS = ["1", "3", "5", "10"] as const;

export function HitRateChart({ hitRate }: { hitRate: EvalPerK }) {
  const data = KS.map((k) => ({ label: `Top ${k}`, percent: Math.round(hitRate[k] * 1000) / 10 }));
  const summary = data.map((d) => `${d.label} ${d.percent}%`).join(", ");
  return (
    <figure>
      <div className="h-56 w-full" role="img" aria-label={`Hit rate by number of retrieved passages: ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--text-muted)", fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
            <Bar dataKey="percent" fill="var(--brand-solid)" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
              <LabelList dataKey="percent" position="top" formatter={(value) => `${value}%`} fill="var(--text)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-sm text-muted">
        Share of answerable questions where the expected page was among the top retrieved passages.
      </figcaption>
    </figure>
  );
}
