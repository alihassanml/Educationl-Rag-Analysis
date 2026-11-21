import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";
import { HeroShot } from "./hero-shot";
import { Reveal } from "./reveal";

export function Hero() {
  return (
    <section className="bg-paper">
      <PageContainer padded={false} className="flex flex-col items-center pt-20 text-center lg:pt-32">
        <Reveal className="rounded-full border border-stone bg-paper px-4 py-1.5 text-sm text-ink-2">Built only from your own PDFs</Reveal>
        <Reveal as="h1" delay={80} className="mt-8 text-balance text-[clamp(2.25rem,5vw,4rem)] font-medium leading-[1.02] tracking-[-0.035em] text-ink">
          Study from your own notes
          <span className="block text-clay">Check every answer</span>
        </Reveal>
        <Reveal as="p" delay={160} className="mt-6 max-w-[40ch] text-balance text-lead text-ink-2 lg:text-[20px] lg:leading-8">
          Upload your PDFs and ask questions. Every answer shows the page it came from.
        </Reveal>
        <Reveal delay={240} className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/register" size="lg">
            Get started
          </ButtonLink>
          <ButtonLink href="#how-it-works" variant="secondary" size="lg">
            See how it works
          </ButtonLink>
        </Reveal>
        <Reveal delay={320} className="dot-grid mt-16 w-full overflow-hidden rounded-[28px] border border-stone bg-stone-50 px-4 pt-10 sm:px-12 sm:pt-14 lg:mt-20 lg:px-24">
          <HeroShot />
        </Reveal>
      </PageContainer>
    </section>
  );
}
