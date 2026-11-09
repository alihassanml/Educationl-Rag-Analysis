import type { ReactNode } from "react";
import { PAGE_GUTTER } from "@/components/layout/page-container";
import { cn } from "@/lib/cn";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={cn("mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center py-10", PAGE_GUTTER)}>
      <p className="mb-8 text-xl font-semibold tracking-tight text-primary">EduRAG</p>
      {children}
    </main>
  );
}
