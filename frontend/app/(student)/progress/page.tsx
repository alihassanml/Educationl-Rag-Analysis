import { ProgressView } from "@/components/progress/progress-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Progress | EduRAG" };

export default function ProgressPage() {
  return <ProgressView />;
}
