import { Suspense } from "react";
import { QuizPage } from "@/components/quizzes/quiz-page";

export const metadata = { title: "Quiz | EduRAG" };

export default function QuizDetailPage() {
  return (
    <Suspense>
      <QuizPage />
    </Suspense>
  );
}
