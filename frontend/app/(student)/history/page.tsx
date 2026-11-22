import { HistoryPage } from "@/components/layout/history-page";

// Client-rendered shell with its own loading state, like the rest of (student)
export const instant = false;

export const metadata = { title: "Chats | EduRAG" };

export default function ChatHistoryPage() {
  return <HistoryPage />;
}
