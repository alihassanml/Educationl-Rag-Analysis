"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Activity } from "@/types/api";

export const MIN_POINTS_FOR_CHART = 3;

export function ScoreChart({ history }: { history: Activity[] }) {
  const data = history.map((a, i) => ({
    attempt: i + 1,
    percent: a.percent,
    label: `${a.quiz_title}: ${a.score} of ${a.total_questions}`,
  }));
  return (
    <figure>
      <div className="h-56 w-full" role="img" aria-label={`Quiz scores over time, ${data.map((d) => `${d.percent}%`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="attempt" tick={{ fill: "var(--text-muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} label={{ value: "Quiz number", position: "insideBottom", offset: -4, fill: "var(--text-muted)", fontSize: 12 }} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--text-muted)", fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={(value) => [`${value}%`, "Score"]} labelFormatter={(_, payload) => payload?.[0]?.payload.label ?? ""} />
            <Line type="monotone" dataKey="percent" stroke="var(--brand-solid)" strokeWidth={2} dot={{ r: 3, fill: "var(--brand-solid)" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-sm text-muted">Percentage correct in each quiz you completed, oldest to newest.</figcaption>
    </figure>
  );
}
