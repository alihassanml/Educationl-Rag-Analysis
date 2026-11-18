import type { ReactNode } from "react";
import Link from "next/link";
import { HeroIllustration } from "@/components/landing/hero-illustration";
import { PageContainer } from "@/components/layout/page-container";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <main className="bg-paper">
        <PageContainer className="flex min-h-screen flex-col">
          <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
            EduRAG
          </Link>
          <div className="flex flex-1 items-center py-10">
            <div className="mx-auto w-full max-w-[400px]">{children}</div>
          </div>
        </PageContainer>
      </main>
      <aside aria-label="About EduRAG" className="hidden flex-col items-center justify-center gap-6 bg-stone-50 p-12 lg:flex">
        <HeroIllustration animated={false} className="max-w-[460px]" />
        <p className="text-lead text-ink">Every answer shows where it came from</p>
      </aside>
    </div>
  );
}
