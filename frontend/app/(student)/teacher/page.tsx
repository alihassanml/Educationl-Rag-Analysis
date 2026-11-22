import { TeacherView } from "@/components/teacher/teacher-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Your classes | EduRAG" };

export default function TeacherPage() {
  return <TeacherView />;
}
