"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

/** Hero product screenshot. It rises in on load (via the parent Reveal), starts tilted back and flattens as the
 *  visitor scrolls the first 400px. With reduced motion it stays flat and still. */
export function HeroShot() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const p = Math.min(Math.max(window.scrollY / 400, 0), 1);
      node.style.transform = `perspective(1600px) rotateX(${(1 - p) * 14}deg) scale(${0.94 + 0.06 * p})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} style={{ transformOrigin: "50% 0%", willChange: "transform" }} className="mx-auto max-w-[1000px] overflow-hidden rounded-t-2xl border border-b-0 border-stone bg-paper shadow-lg">
      <Image src="/landing/tutor-answer.png" alt="The study tutor answering a question, with the document and page listed in a Sources panel" width={1960} height={1184} priority className="h-auto w-full" />
    </div>
  );
}
