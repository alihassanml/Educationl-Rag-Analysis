import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "./reveal";

const STEPS = [
  { title: "Upload your notes", body: "PDFs stay private to your account." },
  { title: "Ask a question", body: "Get an answer with the document and page." },
  { title: "Practise and revise", body: "Quizzes show what to study next." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-paper">
      <PageContainer padded={false} className="pb-8 pt-24 lg:pt-36">
        <Reveal as="h2" className="mx-auto max-w-[16ch] text-balance text-center text-[clamp(2.25rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.03em] text-ink">
          Three steps to study smarter
        </Reveal>
        <Reveal delay={100}>
          <ol className="mt-14 grid overflow-hidden rounded-[28px] border border-stone md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-10 border-b border-stone p-8 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 lg:p-10">
                <span className="flex size-10 items-center justify-center rounded-full bg-clay-soft text-base font-semibold text-clay-strong">{i + 1}</span>
                <div>
                  <h3 className="text-[24px] font-medium leading-8 text-ink">{step.title}</h3>
                  <p className="mt-2 text-base text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </PageContainer>
    </section>
  );
}
