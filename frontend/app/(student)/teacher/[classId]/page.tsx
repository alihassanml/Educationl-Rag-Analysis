import { ClassManager } from "@/components/teacher/class-manager";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Class | EduRAG" };

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <ClassManager classId={classId} />;
}
