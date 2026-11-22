import { Suspense } from "react";
import { QuizzesView } from "@/components/quizzes/quizzes-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Quizzes | EduRAG" };

export default function QuizzesPage() {
  return (
    <Suspense>
      <QuizzesView />
    </Suspense>
  );
}
