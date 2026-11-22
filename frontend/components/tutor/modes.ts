import { AlignLeft, Lightbulb, ListChecks, MessageCircleQuestion, type LucideIcon } from "lucide-react";

/** How the tutor writes its answer. The server adds the matching instruction; the question is saved as typed. */
export type ChatMode = "ask" | "quiz" | "summary" | "simple";

export const CHAT_MODES: { id: ChatMode; label: string; icon: LucideIcon; placeholder: string }[] = [
  { id: "ask", label: "Ask", icon: MessageCircleQuestion, placeholder: "Ask a question about your material" },
  { id: "quiz", label: "Quiz me", icon: ListChecks, placeholder: "Which topic should I quiz you on?" },
  { id: "summary", label: "Summarise", icon: AlignLeft, placeholder: "What should I summarise?" },
  { id: "simple", label: "Explain simply", icon: Lightbulb, placeholder: "What should I explain in simple words?" },
];

export const modeOf = (id: ChatMode) => CHAT_MODES.find((m) => m.id === id) ?? CHAT_MODES[0];
