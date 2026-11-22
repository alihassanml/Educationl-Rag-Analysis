import { CourseMapView } from "@/components/course-map/course-map-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Course Map | EduRAG" };

export default function CourseMapPage() {
  return <CourseMapView />;
}
