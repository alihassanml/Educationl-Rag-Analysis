import { cn } from "@/lib/cn";

/**
 * "From your page to a cited answer" (docs/UI_REDESIGN.md section 10). Inline SVG, colours only from
 * CSS variables, decorative for screen readers. The sample names ("OS Notes.pdf", "Deadlock") are
 * illustration content, not data. Animation is CSS only (see `.hero-ill` in globals.css) and is
 * skipped under prefers-reduced-motion. `animated={false}` renders the final frame (auth screens).
 */

type Point = [number, number];

const CURVE: [Point, Point, Point, Point] = [
  [190, 185],
  [236, 190],
  [214, 300],
  [262, 352],
];

function bezier(t: number): Point {
  const [p0, p1, p2, p3] = CURVE;
  const u = 1 - t;
  const at = (i: 0 | 1) => u ** 3 * p0[i] + 3 * u ** 2 * t * p1[i] + 3 * u * t ** 2 * p2[i] + t ** 3 * p3[i];
  return [at(0), at(1)];
}

const TILES = [0.1, 0.27, 0.45, 0.62, 0.8].map(bezier);
const NODES: { x: number; y: number; r: number; hot?: boolean }[] = [
  { x: 232, y: 346, r: 7 },
  { x: 264, y: 338, r: 6 },
  { x: 294, y: 352, r: 8 },
  { x: 240, y: 376, r: 9 },
  { x: 268, y: 380, r: 10, hot: true },
  { x: 232, y: 408, r: 6 },
  { x: 296, y: 400, r: 7 },
];
const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [2, 4],
  [3, 4],
  [3, 5],
  [4, 6],
  [2, 6],
];
const PROOF_PATH = "M515 162 C 515 58, 236 36, 192 178";
const LINES = [
  { y: 112, w: 140 },
  { y: 134, w: 120 },
  { y: 156, w: 136 },
  { y: 178, w: 128, matched: true },
  { y: 200, w: 132 },
  { y: 222, w: 100 },
  { y: 244, w: 138 },
  { y: 266, w: 90 },
];
const ANSWER_LINES = [178, 160, 170, 120];

export function HeroIllustration({ animated = true, className }: { animated?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 560 480"
      aria-hidden="true"
      focusable="false"
      data-animate={animated ? "true" : "false"}
      className={cn("hero-ill h-auto w-full max-w-[560px]", className)}
      fontFamily="var(--font-sans)"
    >
      <defs>
        <pattern id="hero-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.75" fill="var(--stone)" />
        </pattern>
        <clipPath id="hero-stage">
          <rect width="560" height="480" rx="24" />
        </clipPath>
        <filter id="hero-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="8" stdDeviation="9" floodOpacity="0.14" style={{ floodColor: "var(--ink)" }} />
        </filter>
        <mask id="hero-proof-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="560" height="480">
          <path d={PROOF_PATH} fill="none" stroke="var(--paper)" strokeWidth="6" pathLength={100} className="hi-draw" strokeDasharray="100" />
        </mask>
      </defs>

      {/* Stage */}
      <g clipPath="url(#hero-stage)">
        <rect width="560" height="480" fill="var(--stone-50)" />
        <rect width="560" height="480" fill="url(#hero-dots)" opacity="0.7" />
      </g>

      {/* Pages */}
      <g transform="rotate(-6 117 195)" className="hi-page" style={{ animationDelay: "0ms" }}>
        <rect x="32" y="70" width="170" height="250" rx="8" fill="var(--paper)" stroke="var(--stone)" />
      </g>
      <g transform="rotate(-2 117 195)" className="hi-page" style={{ animationDelay: "80ms" }}>
        <rect x="32" y="70" width="170" height="250" rx="8" fill="var(--paper)" stroke="var(--stone)" />
      </g>
      <g className="hi-page" style={{ animationDelay: "160ms" }}>
        <rect x="32" y="70" width="170" height="250" rx="8" fill="var(--paper)" stroke="var(--stone)" />
        <rect x="44" y="84" width="90" height="10" rx="5" fill="var(--stone)" />
        {LINES.map((line) =>
          line.matched ? (
            <g key={line.y}>
              <rect x="40" y={line.y - 7} width="152" height="16" rx="4" fill="var(--clay-soft)" className="hi-highlight" />
              <rect x="40" y={line.y - 7} width="3" height="16" rx="1.5" fill="var(--clay)" className="hi-highlight" />
              <rect x="48" y={line.y - 2} width={line.w} height="6" rx="3" fill="var(--stone-strong)" />
            </g>
          ) : (
            <rect key={line.y} x="44" y={line.y - 2} width={line.w} height="6" rx="3" fill="var(--stone)" />
          ),
        )}
        <text x="44" y="306" fontSize="11" fill="var(--ink-3)" className="hero-label">
          p. 45
        </text>
      </g>

      {/* Indexing: passages travel to a knowledge cluster */}
      <path d={`M${CURVE[0]} C ${CURVE[1]}, ${CURVE[2]}, ${CURVE[3]}`} fill="none" stroke="var(--stone)" strokeWidth="1" strokeDasharray="2 4" />
      {TILES.map(([x, y], i) => (
        <rect key={i} x={x - 14} y={y - 5} width="28" height="10" rx="3" fill="var(--paper)" stroke="var(--stone)" className="hi-tile" style={{ animationDelay: `${800 + i * 140}ms` }} />
      ))}
      <g>
        {EDGES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="var(--stone)" strokeWidth="1.25" />
        ))}
        {NODES.map((node, i) => (
          <circle
            key={i}
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill={node.hot ? "var(--clay)" : "var(--paper)"}
            stroke={node.hot ? "var(--clay)" : "var(--stone-strong)"}
            strokeWidth="1.25"
            className={node.hot ? "hi-hot" : undefined}
          />
        ))}
        <text x="268" y="428" textAnchor="middle" fontSize="11" fill="var(--ink-2)" className="hero-label">
          Deadlock
        </text>
      </g>

      {/* Answer card */}
      <g filter="url(#hero-shadow)" className="hi-card">
        <rect x="318" y="90" width="222" height="210" rx="16" fill="var(--paper)" stroke="var(--stone)" />
      </g>
      <text x="340" y="122" fontSize="11" fontWeight="600" letterSpacing="0.66" fill="var(--ink-2)" className="hero-label">
        ANSWER
      </text>
      {ANSWER_LINES.map((w, i) => (
        <rect key={i} x="340" y={142 + i * 24} width={w} height="8" rx="4" fill="var(--stone)" className="hi-line" style={{ animationDelay: `${1600 + i * 120}ms` }} />
      ))}
      <g className="hi-pill" style={{ animationDelay: "2100ms" }}>
        <rect x="504" y="164" width="24" height="16" rx="6" fill="var(--clay-soft)" className="hi-pill-btn" />
        <text x="516" y="176" textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--clay-stronger)" className="hero-label">
          [1]
        </text>
      </g>
      <rect x="340" y="248" width="178" height="30" rx="8" fill="var(--stone-100)" />
      <rect x="350" y="257" width="10" height="12" rx="2" fill="none" stroke="var(--ink-2)" strokeWidth="1.25" />
      <text x="368" y="267" fontSize="11" fill="var(--ink-2)" className="hero-label">
        OS Notes.pdf · p. 45
      </text>

      {/* The proof link, from the citation back to the exact line */}
      <path d={PROOF_PATH} fill="none" stroke="var(--clay)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" mask="url(#hero-proof-mask)" className="hi-connector" />
      <circle cx="192" cy="178" r="3.5" fill="var(--clay)" className="hi-end" />

      {/* Next step */}
      <g className="hi-next">
        <rect x="318" y="330" width="222" height="90" rx="12" fill="var(--stone-100)" />
        <rect x="334" y="346" width="68" height="20" rx="10" fill="var(--success-soft)" />
        <text x="368" y="360" textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--success)" className="hero-label">
          Next step
        </text>
        <text x="334" y="394" fontSize="12" fill="var(--ink)" className="hero-label">
          Revise Deadlock · you scored 2/5
        </text>
        <path d="M508 356 h16 m-6 -6 l6 6 -6 6" fill="none" stroke="var(--clay)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
