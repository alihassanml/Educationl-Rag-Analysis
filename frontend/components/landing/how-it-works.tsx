import { Section, SectionHeading } from "./section";

const STEPS = [
  { title: "Upload your material", body: "PDF notes, slides and books stay private to your account" },
  { title: "EduRAG builds your knowledge base", body: "Text is split into passages and indexed so it can be searched by meaning" },
  { title: "Ask, and check the source", body: "Answers cite the document and page, or say “Not found in your material”" },
  { title: "Practise and improve", body: "Quizzes from your files find weak topics and suggest your next step" },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="muted">
      <SectionHeading title="From your notes to your next step in four steps" />
      <ol className="relative grid gap-10 lg:grid-cols-4 lg:gap-8">
        {/* Thin stone line joining the steps, with a clay dot at each one */}
        <span aria-hidden="true" className="absolute left-[7px] top-2 bottom-2 w-px bg-stone lg:inset-x-0 lg:bottom-auto lg:top-[7px] lg:h-px lg:w-auto" />
        {STEPS.map((step) => (
          <li key={step.title} className="relative pl-10 lg:pl-0 lg:pt-10">
            <span aria-hidden="true" className="absolute left-0 top-1 size-[15px] rounded-full border-2 border-stone-50 bg-clay lg:top-0" />
            <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
