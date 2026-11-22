import { Suspense } from "react";
import { TutorView } from "@/components/tutor/tutor-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Study tutor | EduRAG" };

export default function TutorPage() {
  return (
    <Suspense>
      <TutorView />
    </Suspense>
  );
}
