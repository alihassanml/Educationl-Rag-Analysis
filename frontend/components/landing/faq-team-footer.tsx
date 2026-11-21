import { Plus } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";
import { MAX_UPLOAD_MB } from "@/lib/validators";
import { Reveal } from "./reveal";

const FAQ = [
  { q: "Is my material private?", a: "Yes. Your files belong to your account, and other users cannot see or search them." },
  { q: "Can EduRAG be wrong?", a: "Yes. That is why every answer shows its source, so you can check it. When your notes don’t cover a question, it says so instead of guessing." },
  { q: "Which files can I upload?", a: `PDF files with selectable text, up to ${MAX_UPLOAD_MB} MB each. Scanned pages without text can’t be read yet.` },
  { q: "Who built it?", a: "EduRAG was built by Amber Rehan and Ali Ahmed, supervised by Talha Javeed." },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 bg-paper">
      <PageContainer padded={false} className="grid gap-12 py-24 lg:grid-cols-12 lg:gap-12 lg:py-36">
        <Reveal as="h2" className="text-balance text-[clamp(2.25rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.03em] text-ink lg:col-span-5">
          Questions, answered
        </Reveal>
        <Reveal delay={120} className="lg:col-span-7">
          <div className="divide-y divide-stone border-y border-stone">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-control text-[20px] font-medium leading-7 text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus size={22} strokeWidth={1.5} className="shrink-0 text-ink-2 transition-transform duration-[180ms] group-open:rotate-[135deg]" aria-hidden="true" />
                </summary>
                <p className="mt-3 max-w-[52ch] text-base text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </PageContainer>
    </section>
  );
}

/** The one bold moment on the page: a full-width clay band that the footer card rises into. */
export function FinalCta() {
  return (
    <section className="bg-clay-strong text-paper">
      <PageContainer padded={false} className="flex flex-col items-center pb-24 pt-28 text-center lg:pb-32 lg:pt-36">
        <Reveal as="h2" className="max-w-[14ch] text-balance text-[clamp(2.5rem,6vw,4.75rem)] font-medium leading-[1.04] tracking-[-0.035em]">
          Start with one PDF
        </Reveal>
        <Reveal as="p" delay={120} className="mt-6 max-w-[34ch] text-balance text-lead text-paper/85 lg:text-[20px] lg:leading-8">
          Upload your notes and ask your first question in minutes.
        </Reveal>
        <Reveal delay={240} className="mt-10">
          <ButtonLink href="/register" variant="secondary" size="lg" className="border-transparent hover:bg-stone-100">
            Get started
          </ButtonLink>
        </Reveal>
      </PageContainer>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-clay-strong px-4 sm:px-6 xl:px-8">
      <div className="mx-auto w-full max-w-[1200px] rounded-t-[32px] bg-paper px-8 pb-8 pt-12 lg:px-14 lg:pt-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-6">
            <p className="text-lg font-semibold tracking-tight text-ink">EduRAG</p>
            <p className="mt-4 max-w-[22ch] text-balance text-[28px] font-medium leading-9 tracking-[-0.02em] text-ink-2">Study from your own notes. Check every answer.</p>
          </div>
          <nav aria-label="Product" className="md:col-span-3">
            <p className="mb-4 text-sm font-medium text-ink">Product</p>
            <ul className="flex flex-col gap-3 text-sm text-ink-2">
              <li>
                <a href="#how-it-works" className="hover:text-clay-strong">
                  How it works
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-clay-strong">
                  Features
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-clay-strong">
                  FAQ
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Account" className="md:col-span-3">
            <p className="mb-4 text-sm font-medium text-ink">Account</p>
            <ul className="flex flex-col gap-3 text-sm text-ink-2">
              <li>
                <Link href="/login" className="hover:text-clay-strong">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-clay-strong">
                  Create account
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="mt-14 text-small text-ink-3">© 2026 EduRAG</p>
      </div>
    </footer>
  );
}
