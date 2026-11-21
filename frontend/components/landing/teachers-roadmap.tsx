import { plannedFeatures } from "@/lib/features";
import { Section } from "./section";

export function Teachers() {
  return (
    <Section className="lg:py-16">
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
        <h2 className="text-h1 font-medium text-ink lg:col-span-5 lg:text-h1-lg">Built for students who study from their own course material</h2>
        <p className="max-w-[65ch] text-base text-ink-2 lg:col-span-7 lg:pt-2">
          EduRAG is aimed at university students, O and A Level students and tuition centres. Today each student works in a private library of their own files.
          Classroom and teacher features are not built yet and are listed in the roadmap below.
        </p>
      </div>
    </Section>
  );
}

/** Planned features as a plain list. The heading already says none of them exist, so rows carry no badges. */
export function Roadmap() {
  const planned = plannedFeatures();
  return (
    <Section tone="muted">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <h2 className="text-h1 font-medium text-ink lg:text-h1-lg">Planned, not built yet</h2>
          <p className="mt-3 text-lead text-ink-2">None of these is available today</p>
        </div>
        <ul className="divide-y divide-stone border-y border-stone lg:col-span-8">
          {planned.map((feature) => (
            <li key={feature.id} className="grid gap-1 py-3 md:grid-cols-[13rem_1fr] md:gap-6">
              <p className="font-medium text-ink">{feature.label}</p>
              <p className="text-ink-2">{feature.roadmap}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
