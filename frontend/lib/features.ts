import {
  BarChart3,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";

/**
 * Display config for product modules (docs/UI_REDESIGN.md section 8.2). Nav and the landing feature
 * sections render only `live` items; the roadmap renders `planned` items. A feature becomes `live`
 * only when it works end to end. This file holds copy and routes, never business rules.
 */
export type FeatureStatus = "live" | "planned";
export type NavGroup = "learn" | "practise" | "insights";

export type Feature = {
  id: string;
  status: FeatureStatus;
  label: string;
  nav?: { href: string; group: NavGroup; icon: LucideIcon; adminOnly?: boolean };
  /** Landing feature section (live features only) */
  landing?: { overline: string; title: string; body: string; bullets: string[] };
  /** One line for the roadmap list (planned features only) */
  roadmap?: string;
};

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  learn: "Learn",
  practise: "Practise",
  insights: "Insights",
};

export const FEATURES: Feature[] = [
  {
    id: "tutor",
    status: "live",
    label: "Study tutor",
    nav: { href: "/tutor", group: "learn", icon: MessageCircleQuestion },
    landing: {
      overline: "Study tutor",
      title: "Ask a question and check the source",
      body: "Answers are written only from the passages found in your own uploads. The sources appear before the answer, every answer lists the document and page it came from, and when your notes do not cover a question it says so instead of guessing.",
      bullets: ["Ask follow-up questions, see sources before the answer", "Says “Not found in your material” when unsure", "Chats are saved, and you can stop an answer at any time"],
    },
  },
  { id: "dashboard", status: "live", label: "Dashboard", nav: { href: "/dashboard", group: "learn", icon: LayoutDashboard } },
  {
    id: "library",
    status: "live",
    label: "My library",
    nav: { href: "/library", group: "learn", icon: BookOpen },
  },
  {
    id: "quizzes",
    status: "live",
    label: "Quizzes",
    // No nav entry: quizzes are taken in the chat (Quiz me). The /quizzes pages stay for history and old links.
    landing: {
      overline: "Adaptive quizzes",
      title: "Practise with questions from your own files",
      body: "Generate a quiz on a topic from your material. After you submit, each question shows the correct answer, an explanation and the source page.",
      bullets: ["Beginner, intermediate and advanced levels", "Explanations with the source page", "Difficulty adapts to your last result"],
    },
  },
  {
    id: "progress",
    status: "live",
    label: "Progress",
    nav: { href: "/progress", group: "practise", icon: BarChart3 },
    landing: {
      overline: "Progress and next step",
      title: "See what to revise next, and why",
      body: "Quiz results are grouped by topic. A plain rule marks topics that need revision and suggests one next step, so there is no hidden score.",
      bullets: ["Weak topics found from your quiz results", "The rule is shown in plain words", "One clear next step on your dashboard"],
    },
  },
  {
    id: "evaluation",
    status: "live",
    label: "Evaluation Lab",
    nav: { href: "/evaluation", group: "insights", icon: FlaskConical, adminOnly: true },
    landing: {
      overline: "Evaluation Lab",
      title: "Accuracy you can inspect, not just trust",
      body: "Retrieval is measured on a labelled question set: how often the right page is found, and how often the system correctly refuses an unanswerable question. Every number shows its sample size.",
      bullets: ["Hit rate, MRR and abstention accuracy", "Per-question drill-down", "Dense versus hybrid retrieval compared"],
    },
  },
  // Part of the study tutor: no nav entry or landing section of their own, but recorded as live
  { id: "chat-history", status: "live", label: "Chat history" },
  { id: "follow-ups", status: "live", label: "Follow-up questions" },
  { id: "streaming", status: "live", label: "Streamed answers" },
  { id: "diagnostic", status: "planned", label: "Diagnostic test", roadmap: "A short starting test that sets your first topic levels" },
  { id: "ingestion", status: "planned", label: "More file types", roadmap: "Upload DOCX files and YouTube lectures, not only PDFs" },
  { id: "teacher-style", status: "planned", label: "Teacher-style mode", roadmap: "Answers in the wording and structure your teacher uses" },
  { id: "mood-pacing", status: "planned", label: "Mood-aware pacing", roadmap: "Lighter study steps when your recent answers show strain" },
  { id: "exam-predictor", status: "planned", label: "Exam predictor", roadmap: "Topic likelihood from past papers, shown with its evidence" },
  { id: "viva", status: "planned", label: "Viva bot", roadmap: "Oral exam practice with follow-up questions and rubric scoring" },
  { id: "peer-match", status: "planned", label: "Peer match", roadmap: "Opt-in quiz duels with students who share weak topics" },
  { id: "reminders", status: "planned", label: "Study reminders", roadmap: "Reminders for topics that are due for review" },
];

export const liveFeatures = (): Feature[] => FEATURES.filter((f) => f.status === "live");
export const plannedFeatures = (): Feature[] => FEATURES.filter((f) => f.status === "planned");

export type NavItem = { label: string; href: string; icon: LucideIcon; group: NavGroup; adminOnly: boolean };

/** Nav items for live features only, in registry order. */
export function navItems(): NavItem[] {
  return liveFeatures().flatMap((f) =>
    f.nav ? [{ label: f.label, href: f.nav.href, icon: f.nav.icon, group: f.nav.group, adminOnly: Boolean(f.nav.adminOnly) }] : [],
  );
}
