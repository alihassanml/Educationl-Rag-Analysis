import { plannedFeatures } from "@/lib/features";
import { Chip } from "@/components/ui/chip";
import { Section, SectionHeading } from "./section";

export function Teachers() {
  return (
    <Section>
      <SectionHeading overline="For teachers and institutes" title="Built for students who study from their own course material" />
      <p className="max-w-[65ch] text-base text-ink-2">
        EduRAG is aimed at university students, O and A Level students and tuition centres. Today each student works in a private library of their own files.
        Classroom and teacher features are not built yet and are listed in the roadmap below.
      </p>
    </Section>
  );
}

export function Roadmap() {
  const planned = plannedFeatures();
  return (
    <Section tone="muted">
      <SectionHeading overline="What’s next" title="Planned, not built yet" lead="These features are planned. None of them is available today" />
      <ul className="grid gap-x-12 gap-y-4 md:grid-cols-2">
        {planned.map((feature) => (
          <li key={feature.id} className="flex items-start gap-3 border-t border-stone pt-4">
            <Chip className="mt-0.5 shrink-0">Planned</Chip>
            <div>
              <p className="font-medium text-ink">{feature.label}</p>
              <p className="text-ink-2">{feature.roadmap}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
