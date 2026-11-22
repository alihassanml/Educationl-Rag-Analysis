import type { DocumentKind } from "@/types/api";

export const KINDS: { value: DocumentKind; label: string; hint: string }[] = [
  { value: "notes", label: "My notes", hint: "Your own notes or summaries" },
  { value: "textbook", label: "Textbook", hint: "A book or chapter" },
  { value: "past_paper", label: "Past paper", hint: "A previous exam, used by the exam predictor" },
  { value: "teacher_material", label: "Teacher material", hint: "Slides or notes from your teacher" },
  { value: "lecture", label: "Lecture", hint: "A lecture video or its transcript" },
];

export const kindLabel = (kind: DocumentKind | undefined): string => KINDS.find((k) => k.value === (kind ?? "notes"))!.label;
