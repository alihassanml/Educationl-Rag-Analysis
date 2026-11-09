export type Delta = { text: string; direction: "up" | "down" | "flat" };

/** 0.8667 -> "86.7%" */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Change between two scores: percentage points by default, or an absolute difference for scores
 *  that are not percentages (such as MRR). */
export function formatDelta(from: number, to: number, unit: "pts" | "abs" = "pts"): Delta {
  const diff = unit === "pts" ? (to - from) * 100 : to - from;
  const noChangeBelow = unit === "pts" ? 0.05 : 0.0005;
  if (Math.abs(diff) < noChangeBelow) return { text: "No change", direction: "flat" };
  const sign = diff > 0 ? "+" : "-";
  const size = Math.abs(diff);
  return {
    text: unit === "pts" ? `${sign}${size.toFixed(1)} pts` : `${sign}${size.toFixed(3)}`,
    direction: diff > 0 ? "up" : "down",
  };
}

export function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function modeLabel(mode: "dense" | "hybrid"): string {
  return mode === "hybrid" ? "Hybrid" : "Dense";
}
