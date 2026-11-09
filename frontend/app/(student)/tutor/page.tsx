import { Suspense } from "react";
import { TutorView } from "@/components/tutor/tutor-view";

export const metadata = { title: "Study Tutor | EduRAG" };

export default function TutorPage() {
  return (
    <Suspense>
      <TutorView />
    </Suspense>
  );
}
