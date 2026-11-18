import { Suspense } from "react";
import { QuizzesView } from "@/components/quizzes/quizzes-view";

export const metadata = { title: "Quizzes | EduRAG" };

export default function QuizzesPage() {
  return (
    <Suspense>
      <QuizzesView />
    </Suspense>
  );
}
