"use client";

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reveals `text` a few characters per frame instead of in the bursts the network delivers it in.
 *  The pace follows the backlog, so a long answer catches up quickly and a short one still glides.
 *  `animate` only matters on first render: text that is already complete then (a saved chat) is
 *  shown at once, and so is everything when `instant` is set. The frame loop stops as soon as the reveal has caught up with the text. */
export function useSmoothText(text: string, animate: boolean, instant = false): { shown: string; done: boolean } {
  const [count, setCount] = useState(() => (animate ? 0 : text.length));
  const revealed = useRef(count);

  // Reduced motion, or a stopped or failed answer, shows everything written so far straight away
  const reduced = instant || prefersReducedMotion();

  useEffect(() => {
    if (reduced) return; // the text is shown whole, see below
    let frame = 0;
    const tick = () => {
      const backlog = text.length - revealed.current;
      if (backlog <= 0) return;
      revealed.current += Math.max(1, Math.ceil(backlog / 14));
      setCount(revealed.current);
      frame = window.requestAnimationFrame(tick);
    };
    if (revealed.current < text.length) frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [text, reduced]);

  const length = reduced ? text.length : Math.min(count, text.length);
  return { shown: text.slice(0, length), done: length >= text.length };
}
