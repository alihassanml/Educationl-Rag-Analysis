import type { Metadata } from "next";
import localFont from "next/font/local";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Self-hosted (variable weight, Latin), so a build never needs to reach Google Fonts
const hankenGrotesk = localFont({
  src: "./fonts/hanken-grotesk-latin-wght-normal.woff2",
  variable: "--font-hanken-grotesk",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduRAG",
  description: "Study from your own material with cited answers, quizzes, and progress tracking",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hankenGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
