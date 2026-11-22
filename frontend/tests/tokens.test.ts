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
  ["ink", "paper", 17.73],
  ["ink", "stone-100", 16.54],
  ["ink", "stone", 14.32],
  ["ink-2", "paper", 7.55],
  ["ink-2", "stone-100", 7.05],
  ["ink-2", "stone", 6.1],
  ["ink-3", "paper", 7.55],
  ["paper", "clay-strong", 17.22],
  ["clay-strong", "paper", 17.22],
  ["clay-strong", "stone-100", 16.06],
  ["paper", "clay-stronger", 21.0],
  ["clay-stronger", "clay-soft", 18.36],
  ["success", "success-soft", 5.52],
  ["warning", "warning-soft", 5.42],
  ["danger", "danger-soft", 5.79],
  ["success", "paper", 6.25],
  ["warning", "paper", 5.92],
  ["danger", "paper", 6.53],
];

const LARGE_OR_UI_PAIRS: [string, string, number][] = [
  ["stone-strong", "paper", 3.76],
  ["stone-strong", "stone-100", 3.51],
  ["clay", "paper", 3.05],
  ["paper", "clay", 3.05],
];

describe("contrastRatio", () => {
  it("is 21 for black on white and symmetric", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });
});

describe("Clean tokens", () => {
  it("keeps the brand colours exactly: white, periwinkle #baccf4 and a cool grey hairline", () => {
    expect(tokens.paper.toLowerCase()).toBe("#ffffff");
    expect(tokens["clay-300"].toLowerCase()).toBe("#baccf4");
    expect(tokens.stone.toLowerCase()).toBe("#e5e7eb");
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

  it("documents why the brand colour needs partners: neither text nor white text works on #baccf4", () => {
    expect(contrastRatio("#ffffff", tokens["clay-300"])).toBeLessThan(4.5);
    expect(ratio("ink", "clay-300")).toBeGreaterThanOrEqual(4.5); // dark text on it is fine
    expect(ratio("ink-2", "clay-300")).toBeGreaterThanOrEqual(4.5);
  });

  it("has no trace of the old terracotta palette", () => {
    expect(css).not.toMatch(/#(d36243|b5492c|9c3d26|fbeee9|f6dcd2|e8a48f)/i);
  });

  it("gives every role that carries text enough contrast on white and on the soft fill", () => {
    for (const role of ["accent-ink", "accent-link"]) {
      expect(ratio(role, "paper")).toBeGreaterThanOrEqual(4.5);
      expect(ratio(role, "clay-soft")).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(tokens["on-accent"], tokens["clay-strong"])).toBeGreaterThanOrEqual(4.5);
  });
});
