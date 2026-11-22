/**
 * Decorative backdrop for the landing hero: soft periwinkle and cream glows that drift slowly,
 * over a fine grid that fades out towards the edges. CSS only (see `.hero-bg` in globals.css);
 * the global reduced-motion rule freezes it on its first frame.
 */
export function HeroBackground() {
  return (
    <div aria-hidden="true" className="hero-bg pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="hero-bg-grid absolute inset-0" />
      <div className="hero-bg-orb hero-bg-orb-a" />
      <div className="hero-bg-orb hero-bg-orb-b" />
      <div className="hero-bg-orb hero-bg-orb-c" />
      <div className="hero-bg-sheen absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-paper" />
    </div>
  );
}
