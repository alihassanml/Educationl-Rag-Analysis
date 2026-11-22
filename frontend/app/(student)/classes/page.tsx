import { ClassesView } from "@/components/classes/classes-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "My classes | EduRAG" };

export default function ClassesPage() {
  return <ClassesView />;
}
