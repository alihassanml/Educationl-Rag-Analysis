import { Check } from "lucide-react";
import { existsSync } from "node:fs";
import path from "node:path";
import { liveFeatures } from "@/lib/features";
import { cn } from "@/lib/cn";
import { Section } from "./section";

// Real screenshots captured with Playwright into public/landing (step 9 of the brief).
// A section shows its image only if the file exists, so nothing is ever mocked up.
const IMAGES: Record<string, { file: string; alt: string }[]> = {
  tutor: [
    { file: "tutor-answer.png", alt: "The study tutor answering a question with a source panel listing document and page" },
    { file: "tutor-not-found.png", alt: "The study tutor saying a question is not found in the student’s material" },
  ],
  quizzes: [{ file: "quiz-result.png", alt: "A quiz result with explanations and source pages" }],
  progress: [{ file: "progress.png", alt: "Progress page with weak topics and the rule used to find them" }],
  evaluation: [{ file: "evaluation.png", alt: "Evaluation Lab with retrieval metrics and the abstention matrix" }],
};

function available(id: string) {
  return (IMAGES[id] ?? []).filter((image) => existsSync(path.join(process.cwd(), "public", "landing", image.file)));
}

export function Features() {
  const sections = liveFeatures().filter((feature) => feature.landing);
  return (
    <div id="features">
      {sections.map((feature, i) => {
        const copy = feature.landing!;
        const images = available(feature.id);
        return (
          <Section key={feature.id} id={feature.id === "evaluation" ? "evaluation" : undefined} tone={i % 2 === 0 ? "paper" : "muted"}>
            <div className={cn("grid items-center gap-10 lg:gap-16", images.length > 0 && "lg:grid-cols-2")}>
              <div className={cn(images.length > 0 && i % 2 === 1 && "lg:order-2")}>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">{copy.overline}</p>
                <h2 className="mt-2 text-h1 font-medium text-ink lg:text-h1-lg">{copy.title}</h2>
                <p className="mt-4 max-w-[60ch] text-base text-ink-2">{copy.body}</p>
                <ul className="mt-6 flex flex-col gap-2">
                  {copy.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-ink">
                      <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-clay" aria-hidden="true" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              {images.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {images.map((image) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={image.file} src={`/landing/${image.file}`} alt={image.alt} loading="lazy" className="w-full rounded-panel border border-stone bg-paper" />
                  ))}
                </div>
              ) : null}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
