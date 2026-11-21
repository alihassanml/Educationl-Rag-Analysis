"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** The one landing animation: content fades up once as it scrolls into view (or on load, if already visible).
 *  The hidden starting state lives in app/globals.css and only applies when scripting is on and the visitor has
 *  not asked for reduced motion, so the page is fully readable without it. */
export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "h1" | "h2" | "p" | "li" }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.dataset.in = "true";
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} data-reveal="" className={className} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}
