import { Check } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";
import { HeroIllustration } from "./hero-illustration";

const TRUST = ["Private to your account", "Page-level citations", "Says when it doesn’t know"];

export function Hero() {
  return (
    <section className="bg-paper">
      <PageContainer padded={false} className="grid min-h-[560px] items-center gap-12 py-12 lg:grid-cols-2 lg:py-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Final year project · Lahore Garrison University</p>
          <h1 className="mt-4 text-display font-medium tracking-[-0.02em] text-ink lg:text-display-lg">
            Study from your own notes, with <span className="text-clay">answers you can check</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-lead text-ink-2">
            Upload your PDFs and EduRAG becomes a private tutor. Every answer cites the document and page it came from, it tells you when your notes don&apos;t
            cover a question, and your quiz results decide what you revise next
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register" size="lg">
              Get started
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="secondary" size="lg">
              See how it works
            </ButtonLink>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-small text-ink-2">
            {TRUST.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check size={14} strokeWidth={1.75} className="text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center lg:justify-end">
          <HeroIllustration />
        </div>
      </PageContainer>
    </section>
  );
}
