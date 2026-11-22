import { DashboardView } from "@/components/dashboard/dashboard-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Dashboard | EduRAG" };

export default function DashboardPage() {
  return <DashboardView />;
}
