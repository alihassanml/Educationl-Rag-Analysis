"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/use-dismiss";
import type { FeedbackRating, FeedbackReason } from "@/types/api";

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: "wrong", label: "Wrong" },
  { value: "missing_source", label: "Missing source" },
  { value: "unclear", label: "Not clear" },
];

type Props = {
  value: FeedbackRating | null;
  onRate: (rating: FeedbackRating, reason?: FeedbackReason) => void;
};

/** Thumbs up or down. A thumbs down is saved at once and opens a small popover for an optional reason. */
export function FeedbackButtons({ value, onRate }: Props) {
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, reasonsOpen, () => setReasonsOpen(false));

  const iconButton = (active: boolean) => cn(active && "border-clay bg-clay-soft text-clay-stronger");

  return (
    <div ref={root} className="relative flex gap-1">
      <Button variant="ghost" size="sm" aria-label="Good answer" aria-pressed={value === "up"} className={iconButton(value === "up")} onClick={() => onRate("up")}>
        <ThumbsUp size={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Poor answer"
        aria-pressed={value === "down"}
        aria-expanded={reasonsOpen}
        className={iconButton(value === "down")}
        onClick={() => {
          onRate("down");
          setReasonsOpen(true);
        }}
      >
        <ThumbsDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>
      {reasonsOpen ? (
        <div role="group" aria-label="What was wrong" className="absolute bottom-full left-0 z-20 mb-2 flex w-56 flex-col gap-1 rounded-panel border border-stone bg-paper p-2 shadow-md">
          <p className="px-2 pt-1 text-small text-ink-2">What was wrong? (optional)</p>
          {REASONS.map(({ value: reason, label }) => (
            <Button
              key={reason}
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                onRate("down", reason);
                setReasonsOpen(false);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
