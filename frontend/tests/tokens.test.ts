import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(join(__dirname, "../styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function hexTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value;
  }
  return tokens;
}

const tokens = hexTokens();
const ratio = (foreground: string, background: string) => contrastRatio(tokens[foreground], tokens[background]);

// Every pair from docs/UI_REDESIGN.md section 3.2, with the ratio the brief reports (rounded down).
// WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI shapes.
const TEXT_PAIRS: [string, string, number][] = [
  ["ink", "paper", 17.2],
  ["ink", "stone-100", 15.6],
  ["ink", "stone", 12.5],
  ["ink-2", "paper", 6.69],
  ["ink-2", "stone-100", 6.08],
  ["ink-2", "stone", 4.88],
  ["ink-3", "paper", 5.33],
  ["paper", "clay-strong", 5.31],
  ["clay-strong", "paper", 5.31],
  ["clay-strong", "stone-100", 4.83],
  ["paper", "clay-stronger", 6.75],
  ["clay-stronger", "clay-soft", 5.95],
  ["success", "success-soft", 5.52],
  ["warning", "warning-soft", 5.43],
  ["danger", "danger-soft", 5.79],
  ["success", "paper", 4.5],
  ["warning", "paper", 4.5],
  ["danger", "paper", 4.5],
];

const LARGE_OR_UI_PAIRS: [string, string, number][] = [
  ["stone-strong", "paper", 3.45],
  ["stone-strong", "stone-100", 3.14],
  ["clay", "paper", 3.75],
  ["paper", "clay", 3.75],
];

describe("contrastRatio", () => {
  it("is 21 for black on white and symmetric", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });
});

describe("Paper, Clay & Stone tokens", () => {
  it("keeps the three owner colours exactly", () => {
    expect(tokens.paper.toLowerCase()).toBe("#ffffff");
    expect(tokens.clay.toLowerCase()).toBe("#d36243");
    expect(tokens.stone.toLowerCase()).toBe("#dcdcdc");
  });

  it("is light only: no dark block, no leftover Midnight & Ice variables", () => {
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).not.toMatch(/--(brand|glow|glass|surface|bg|text)(-[a-z]+)?\s*:/);
  });

  it.each(TEXT_PAIRS)("text %s on %s reaches 4.5:1 and the documented ratio", (foreground, background, documented) => {
    expect(tokens[foreground], `--${foreground} missing`).toBeDefined();
    expect(tokens[background], `--${background} missing`).toBeDefined();
    const value = ratio(foreground, background);
    expect(value).toBeGreaterThanOrEqual(4.5);
    expect(value).toBeGreaterThanOrEqual(documented - 0.1);
  });

  it.each(LARGE_OR_UI_PAIRS)("%s on %s reaches 3:1 (large text and UI only)", (foreground, background, documented) => {
    const value = ratio(foreground, background);
    expect(value).toBeGreaterThanOrEqual(3);
    expect(value).toBeGreaterThanOrEqual(documented - 0.1);
  });

  it("documents why clay needs a darker partner: white on clay fails AA for small text", () => {
    expect(ratio("paper", "clay")).toBeLessThan(4.5);
  });
});
