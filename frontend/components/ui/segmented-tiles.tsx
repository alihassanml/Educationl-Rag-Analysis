"use client";

import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string; description?: string };

type Props<T extends string> = {
  name: string;
  legend: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** Radio group drawn as tiles (difficulty, tutor modes). Native radios, so arrow keys just work. */
export function SegmentedTiles<T extends string>({ name, legend, options, value, onChange, disabled }: Props<T>) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-10 cursor-pointer flex-col justify-center rounded-control border px-3 py-2 text-sm transition-colors duration-[120ms]",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-clay",
                selected ? "border-clay bg-clay-soft text-clay-stronger" : "border-stone bg-paper text-ink hover:bg-stone-100",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="font-medium">{option.label}</span>
              {option.description ? <span className="text-small text-ink-2">{option.description}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
