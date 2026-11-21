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
        const flip = images.length > 0 && i % 2 === 1;
        return (
          <Section key={feature.id} id={feature.id === "evaluation" ? "evaluation" : undefined} tone={i % 2 === 0 ? "paper" : "muted"} className={i === 0 ? "lg:py-24" : "lg:py-20"}>
            <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
              <div className={cn("lg:sticky lg:top-24", images.length > 0 ? "lg:col-span-5" : "lg:col-span-7", flip && "lg:order-2")}>
                <h2 className="text-h1 font-medium text-ink lg:text-h1-lg">{copy.title}</h2>
                <p className="mt-4 max-w-[60ch] text-base text-ink-2">{copy.body}</p>
                <ul className="mt-6 divide-y divide-stone border-y border-stone">
                  {copy.bullets.map((bullet) => (
                    <li key={bullet} className="py-2.5 text-ink">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              {images.length > 0 ? (
                <div className="flex flex-col gap-4 lg:col-span-7">
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
