import { SettingsView } from "@/components/settings/settings-view";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Settings | EduRAG" };

export default function SettingsPage() {
  return <SettingsView />;
}
