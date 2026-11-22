import { LightStepView } from "@/components/light-mode/light-step-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "A lighter step | EduRAG" };

export default function LightStepPage() {
  return <LightStepView />;
}
