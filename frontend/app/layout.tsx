import type { Metadata } from "next";
import { Google_Sans_Flex } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const googleSansFlex = Google_Sans_Flex({
  variable: "--font-google-sans-flex",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduRAG",
  description: "Study from your own material with cited answers, quizzes, and progress tracking",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${googleSansFlex.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
