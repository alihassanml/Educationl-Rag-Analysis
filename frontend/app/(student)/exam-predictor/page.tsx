import { ExamPredictorView } from "@/components/exam-predictor/exam-predictor-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Exam predictor | EduRAG" };

export default function ExamPredictorPage() {
  return <ExamPredictorView />;
}
