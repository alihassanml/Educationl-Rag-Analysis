import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(join(__dirname, "../styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");

function declaredNames(section: string): string[] {
  return [...section.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]).sort();
}

function hexTokens(section: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of section.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value;
  }
  return tokens;
}

const themes = {
  light: css.slice(0, darkStart),
  dark: css.slice(darkStart),
};

// Text colour on its background; WCAG 2.1 AA needs 4.5:1 for normal text.
const TEXT_PAIRS: [string, string][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text-muted", "bg"],
  ["text-muted", "surface"],
  ["text-muted", "surface-2"],
  ["text-subtle", "surface"],
  ["on-brand", "brand-solid"],
  ["on-brand", "danger"],
  ["brand-solid", "bg"],
  ["brand-solid", "surface"],
  ["brand-solid", "brand-soft"],
  ["success", "surface"],
  ["warning", "surface"],
  ["danger", "surface"],
];

describe("contrastRatio", () => {
  it("is 21 for black on white and symmetric", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("matches the measured ratio of the guide's brand blue on white", () => {
    expect(contrastRatio("#1F6FFF", "#FFFFFF")).toBeCloseTo(4.4, 1);
  });
});

describe("design tokens", () => {
  it("has a dark block", () => {
    expect(darkStart).toBeGreaterThan(0);
  });

  it("defines the same variable names in light and dark", () => {
    expect(declaredNames(themes.dark)).toEqual(declaredNames(themes.light));
  });

  for (const theme of ["light", "dark"] as const) {
    describe(theme, () => {
      const tokens = hexTokens(themes[theme]);
      it.each(TEXT_PAIRS)("%s on %s reaches 4.5:1", (foreground, background) => {
        expect(tokens[foreground], `--${foreground} missing`).toBeDefined();
        expect(tokens[background], `--${background} missing`).toBeDefined();
        expect(contrastRatio(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
