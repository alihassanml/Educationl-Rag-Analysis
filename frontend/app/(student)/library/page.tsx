import { LibraryView } from "@/components/library/library-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "My library | EduRAG" };

export default function LibraryPage() {
  return <LibraryView />;
}
