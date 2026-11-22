"use client";

import { FileText } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { cn } from "@/lib/cn";

/** "How it works" as a scroll story. The stage stays pinned while the visitor scrolls, and the whole scene is
 *  drawn from one number: how far through the section they are (0 to 1). Four beats, each owning a quarter:
 *  upload, ask, check the source, practise. With reduced motion the finished scene shows and nothing is pinned. */

const clamp = (n: number) => Math.min(Math.max(n, 0), 1);
/** Progress of `p` between a and b, eased out */
const seg = (p: number, a: number, b: number) => 1 - (1 - clamp((p - a) / (b - a))) ** 3;

const QUESTION = "What causes a deadlock?";
const DOC_LINES = [58, 92, 76, 88, 86, 82, 68, 90];
const HIGHLIGHT = 4;
const TOPICS = [
  { name: "Processes", value: 85, hot: false },
  { name: "Scheduling", value: 70, hot: false },
  { name: "Deadlock", value: 40, hot: true },
];

type Rect = [x: number, y: number, w: number, h: number];
type Layout = { W: number; H: number; m: number; t: number; doc: Rect; question: Rect; answer: Rect; results: Rect };

/** Everything is placed on a fixed canvas and shown in percentages, so the scene scales as one piece.
 *  Phones get a stacked canvas; from 1024px the scene runs left to right across the full width. */
const NARROW: Layout = { W: 600, H: 500, m: 1, t: 1, doc: [30, 30, 264, 300], question: [324, 30, 246, 55], answer: [324, 110, 246, 190], results: [30, 360, 540, 120] };
const WIDE: Layout = { W: 1200, H: 540, m: 0.5, t: 0.62, doc: [40, 40, 340, 460], question: [430, 40, 400, 64], answer: [430, 130, 400, 370], results: [880, 40, 280, 460] };

const REDUCED = "(prefers-reduced-motion: reduce)";
const DESKTOP = "(min-width: 1024px)";

function useMedia(query: string, server: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => server,
  );
}

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const [p, setP] = useState(1);
  const still = useMedia(REDUCED, false);
  const wide = useMedia(DESKTOP, false);
  const L = wide ? WIDE : NARROW;

  useEffect(() => {
    if (still) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const node = sectionRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      // Reaches 1 a little before the pin releases so the finished scene is held for a moment
      const next = clamp(-rect.top / (travel * 0.9));
      setP((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [still]);

  const pct = (r: Rect) => ({ left: `${(r[0] / L.W) * 100}%`, top: `${(r[1] / L.H) * 100}%`, width: `${(r[2] / L.W) * 100}%`, height: `${(r[3] / L.H) * 100}%` });
  /** Length in container-width units, scaled for the current canvas */
  const c = (n: number) => `${(n * L.m).toFixed(3)}cqw`;
  /** Text size with a readable floor */
  const fs = (n: number, min: number) => `max(${min}px, ${(n * L.t).toFixed(3)}cqw)`;

  // Entrance values, 0 to 1
  const doc = seg(p, 0, 0.1);
  const typed = seg(p, 0.25, 0.36);
  const question = seg(p, 0.24, 0.3);
  const answer = seg(p, 0.3, 0.38);
  const marker = seg(p, 0.5, 0.56);
  const highlight = seg(p, 0.52, 0.6);
  const link = seg(p, 0.58, 0.7);
  const source = seg(p, 0.66, 0.74);
  const results = seg(p, 0.76, 0.84);
  const next = seg(p, 0.9, 0.98);

  // Curve from the highlighted passage to the source chip in the answer
  const sx = L.doc[0] + L.doc[2] * 0.95;
  const sy = L.doc[1] + L.doc[3] * ((55 + 26 * HIGHLIGHT) / 300) + 3;
  const ex = L.answer[0] + L.answer[2] * 0.06;
  const ey = L.answer[1] + L.answer[3] * 0.8;
  const mx = sx + (ex - sx) * 0.5;

  return (
    <section id="how-it-works" ref={sectionRef} className={cn("scroll-mt-16 bg-paper", !still && "h-[420vh]")}>
      <div className={cn("flex items-center", !still && "sticky top-16 h-[calc(100svh-4rem)]")}>
        <PageContainer site padded={false} className={cn("w-full", still && "py-24")}>
          <div
            aria-hidden="true"
            className={cn("dot-grid relative mx-auto w-full overflow-hidden rounded-[28px] border border-stone bg-stone-50 [container-type:inline-size]", wide ? "aspect-[1200/540]" : "aspect-[6/5] max-w-[640px]")}
          >
            {/* The notes */}
            <div className="absolute rounded-xl border border-stone bg-paper shadow-md" style={{ ...pct(L.doc), opacity: doc, transform: `translateX(${(1 - doc) * -6 * L.m}cqw) scale(${0.96 + 0.04 * doc})` }}>
              <div className="absolute flex items-center text-ink" style={{ left: "7%", top: "5%", gap: c(1.2), fontSize: fs(2.3, 10) }}>
                <FileText className="size-[1em]" strokeWidth={1.75} />
                OS Notes.pdf
              </div>
              {DOC_LINES.map((width, i) => {
                const draw = seg(p, 0.03 + i * 0.008, 0.12 + i * 0.008);
                const top = ((55 + 26 * i) / 300) * 100;
                return (
                  <div key={i} className="absolute" style={{ left: "7%", width: "86%", top: `${top}%`, height: c(1.1) }}>
                    {i === HIGHLIGHT ? (
                      <div className="absolute origin-left rounded-sm bg-clay-soft" style={{ top: `calc(-1 * ${c(1.1)})`, bottom: `calc(-1 * ${c(1.1)})`, left: "-2%", right: "-2%", transform: `scaleX(${highlight})` }}>
                        <span className="absolute inset-y-0 left-0 rounded-full bg-clay" style={{ width: c(0.5) }} />
                      </div>
                    ) : null}
                    <div className={cn("relative h-full origin-left rounded-full", i === HIGHLIGHT ? "bg-ink-3" : "bg-stone")} style={{ width: `${width}%`, transform: `scaleX(${draw})` }} />
                  </div>
                );
              })}
              <span className="absolute text-ink-3" style={{ left: "7%", bottom: "4%", fontSize: fs(2, 9) }}>
                p. 45
              </span>
            </div>

            {/* The question, typed out */}
            <div
              className="absolute flex items-center rounded-full bg-stone-100 text-ink"
              style={{ ...pct(L.question), paddingInline: "3%", opacity: question, transform: `translateY(${(1 - question) * 2 * L.m}cqw)`, fontSize: fs(2.3, 10) }}
            >
              <span className="whitespace-nowrap">{QUESTION.slice(0, Math.round(typed * QUESTION.length))}</span>
            </div>

            {/* The answer */}
            <div className="absolute rounded-xl border border-stone bg-paper shadow-md" style={{ ...pct(L.answer), opacity: answer, transform: `translateY(${(1 - answer) * 3 * L.m}cqw)` }}>
              <p className="absolute font-semibold text-ink-3" style={{ left: "6%", top: "7%", fontSize: fs(1.9, 9) }}>
                Answer
              </p>
              {[84, 76, 56].map((width, i) => (
                <div
                  key={i}
                  className="absolute origin-left rounded-full bg-stone"
                  style={{ left: "6%", top: `${27 + i * 11}%`, width: `${width}%`, height: c(1.1), transform: `scaleX(${seg(p, 0.33 + i * 0.04, 0.45 + i * 0.04)})` }}
                />
              ))}
              <span
                className="absolute rounded bg-clay-soft font-medium text-clay-strong"
                style={{ right: "6%", top: "47%", padding: `${c(0.3)} ${c(1.2)}`, opacity: marker, transform: `scale(${0.6 + 0.4 * marker})`, fontSize: fs(1.9, 9) }}
              >
                [1]
              </span>
              <div
                className="absolute flex items-center rounded-lg bg-stone-100 text-ink"
                style={{ left: "6%", right: "6%", bottom: "7%", height: "26%", paddingInline: "4%", gap: c(1.5), opacity: source, transform: `translateY(${(1 - source) * 1.5 * L.m}cqw)`, fontSize: fs(2, 9) }}
              >
                <FileText className="size-[1.1em] shrink-0 text-clay-strong" strokeWidth={1.75} />
                <span className="whitespace-nowrap">OS Notes.pdf · p. 45</span>
              </div>
            </div>

            {/* The line from the passage to its citation */}
            <svg viewBox={`0 0 ${L.W} ${L.H}`} className="absolute inset-0 h-full w-full">
              <path
                d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`}
                fill="none"
                stroke="var(--clay)"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                style={{ strokeDasharray: 1, strokeDashoffset: 1 - link, opacity: link > 0 ? 1 : 0 }}
              />
            </svg>

            {/* Quiz results and the next step */}
            <div
              className={cn("absolute rounded-xl border border-stone bg-paper shadow-md", wide ? "flex flex-col justify-between" : "flex items-center")}
              style={{ ...pct(L.results), padding: wide ? c(3) : "0 3%", gap: wide ? 0 : "3%", opacity: results, transform: `translateY(${(1 - results) * 4 * L.m}cqw)` }}
            >
              <div className={cn("flex flex-col", wide ? "gap-[5%]" : "flex-1 justify-center")} style={{ gap: wide ? c(5) : c(1.6), fontSize: fs(2, 9) }}>
                {TOPICS.map((topic, i) => (
                  <div key={topic.name} className={cn("flex", wide ? "flex-col" : "items-center")} style={{ gap: wide ? c(1.6) : c(2) }}>
                    <span className={cn("whitespace-nowrap", topic.hot ? "font-medium text-ink" : "text-ink-2")} style={wide ? undefined : { width: c(17), flexShrink: 0 }}>
                      {topic.name}
                    </span>
                    <span className={cn("rounded-full bg-stone-100", wide ? "w-full" : "flex-1")} style={{ height: c(1.4) }}>
                      <span
                        className={cn("block h-full origin-left rounded-full", topic.hot ? "bg-clay" : "bg-stone-strong")}
                        style={{ width: `${topic.value}%`, transform: `scaleX(${seg(p, 0.78 + i * 0.03, 0.9 + i * 0.03)})` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
              <div
                className="flex flex-col justify-center rounded-lg bg-clay-soft"
                style={{
                  height: wide ? "26%" : "78%",
                  width: wide ? "100%" : "31%",
                  paddingInline: c(2.4),
                  gap: c(0.8),
                  opacity: next,
                  transform: `translateY(${(1 - next) * 2 * L.m}cqw) scale(${0.95 + 0.05 * next})`,
                  fontSize: fs(2, 9),
                }}
              >
                <span className="font-semibold text-success">Next step</span>
                <span className="whitespace-nowrap font-medium text-ink">Revise Deadlock</span>
              </div>
            </div>
          </div>
        </PageContainer>
      </div>
    </section>
  );
}
