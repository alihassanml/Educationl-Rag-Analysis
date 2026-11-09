import { BarChart3, BookOpen, ClipboardList, LayoutDashboard, MessageCircleQuestion, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

// Add an item only when its page is implemented.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Library", href: "/library", icon: BookOpen },
  { label: "Study Tutor", href: "/tutor", icon: MessageCircleQuestion },
  { label: "Practice Quizzes", href: "/quizzes", icon: ClipboardList },
  { label: "Progress", href: "/progress", icon: BarChart3 },
];
